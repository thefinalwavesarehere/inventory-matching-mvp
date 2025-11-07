/**
 * Parse File Worker
 * 
 * Processes uploaded files and imports data into database.
 * 
 * Usage:
 *   node dist/workers/parseFile.worker.js
 */

import { Worker, Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import IORedis from 'ioredis';
import { ParseFileJobData } from '../app/lib/queue';
import { processExcelFile } from '../app/lib/utils/fileProcessing';
import * as fs from 'fs';

const prisma = new PrismaClient();
const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

const worker = new Worker<ParseFileJobData>(
  'parse-file',
  async (job: Job<ParseFileJobData>) => {
    const { fileId, projectId, userId } = job.data;

    console.log(`[parse-file] Processing file ${fileId} for project ${projectId}`);

    try {
      // Update file status to PARSING
      await prisma.file.update({
        where: { id: fileId },
        data: { status: 'PARSING' },
      });

      // Create import run
      const importRun = await prisma.importRun.create({
        data: {
          projectId,
          fileId,
          status: 'RUNNING',
        },
      });

      // Get file details
      const file = await prisma.file.findUnique({
        where: { id: fileId },
      });

      if (!file) {
        throw new Error(`File ${fileId} not found`);
      }

      // Read file from storage
      const filePath = file.storageKey; // Adjust if using S3
      const fileBuffer = fs.readFileSync(filePath);

      // Process file based on kind
      let rowsProcessed = 0;

      switch (file.kind) {
        case 'ARNOLD':
          rowsProcessed = await processArnoldFile(fileBuffer, projectId, job);
          break;
        case 'SUPPLIER':
          rowsProcessed = await processSupplierFile(fileBuffer, projectId, job);
          break;
        case 'STORE':
          rowsProcessed = await processStoreFile(fileBuffer, projectId, job);
          break;
        case 'INTERCHANGE':
          rowsProcessed = await processInterchangeFile(fileBuffer, projectId, job);
          break;
        case 'ERIC':
          rowsProcessed = await processEricFile(fileBuffer, projectId, job);
          break;
        default:
          throw new Error(`Unknown file kind: ${file.kind}`);
      }

      // Update file status to PARSED
      await prisma.file.update({
        where: { id: fileId },
        data: {
          status: 'PARSED',
          parsedAt: new Date(),
          rowCount: rowsProcessed,
        },
      });

      // Update import run
      await prisma.importRun.update({
        where: { id: importRun.id },
        data: {
          status: 'SUCCEEDED',
          finishedAt: new Date(),
          rowsProcessed,
        },
      });

      // Create audit log
      await prisma.auditLog.create({
        data: {
          userId,
          projectId,
          entity: 'File',
          entityId: fileId,
          action: 'PARSE_FILE',
          meta: {
            fileName: file.originalName,
            fileKind: file.kind,
            rowsProcessed,
          },
        },
      });

      console.log(`[parse-file] Successfully processed ${rowsProcessed} rows from file ${fileId}`);

      return { rowsProcessed };
    } catch (error) {
      console.error(`[parse-file] Error processing file ${fileId}:`, error);

      // Update file status to FAILED
      await prisma.file.update({
        where: { id: fileId },
        data: { status: 'FAILED' },
      });

      // Update import run
      const importRun = await prisma.importRun.findFirst({
        where: { fileId },
        orderBy: { createdAt: 'desc' },
      });

      if (importRun) {
        await prisma.importRun.update({
          where: { id: importRun.id },
          data: {
            status: 'FAILED',
            finishedAt: new Date(),
            error: error instanceof Error ? error.message : String(error),
          },
        });
      }

      throw error;
    }
  },
  {
    connection,
    concurrency: 2, // Process 2 files at a time
  }
);

/**
 * File processing functions
 */

async function processArnoldFile(
  fileBuffer: Buffer,
  projectId: string,
  job: Job<ParseFileJobData>
): Promise<number> {
  const items = await processExcelFile(fileBuffer, 'arnold');
  const BATCH_SIZE = 1000;

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);

    await prisma.inventoryItem.createMany({
      data: batch.map((item: any) => ({
        projectId,
        partNumber: item.partNumber,
        cost: item.cost,
        totalLastUsage: item.usageLast12,
        partNumberNorm: item.partNumberNorm,
        lineCode: item.lineCode,
        rawData: item.rawData,
      })),
      skipDuplicates: true,
    });

    // Update progress
    await job.updateProgress((i + batch.length) / items.length * 100);
  }

  return items.length;
}

async function processSupplierFile(
  fileBuffer: Buffer,
  projectId: string,
  job: Job<ParseFileJobData>
): Promise<number> {
  const items = await processExcelFile(fileBuffer, 'supplier');
  const BATCH_SIZE = 1000;

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);

    await prisma.supplierItem.createMany({
      data: batch.map((item: any) => ({
        projectId,
        supplier: item.supplierName || 'Unknown',
        partNumber: item.partNumber,
        partFull: item.partFull,
        description: item.description,
        currentCost: item.cost,
        quantity: item.qtyAvail,
        ytdHist: item.ytdHist,
        partNumberNorm: item.partNumberNorm,
        lineCode: item.lineCode,
        rawData: item.rawData,
      })),
      skipDuplicates: true,
    });

    await job.updateProgress((i + batch.length) / items.length * 100);
  }

  return items.length;
}

async function processStoreFile(
  fileBuffer: Buffer,
  projectId: string,
  job: Job<ParseFileJobData>
): Promise<number> {
  const items = await processExcelFile(fileBuffer, 'inventory_report');
  const BATCH_SIZE = 1000;

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);

    await prisma.storeItem.createMany({
      data: batch.map((item: any) => ({
        projectId,
        partNumber: item.partNumber,
        partFull: item.partFull,
        description: item.description,
        currentCost: item.cost,
        quantity: item.qtyAvail,
        rollingUsage: item.rollingUsage,
        partNumberNorm: item.partNumberNorm,
        lineCode: item.lineCode,
        rawData: item.rawData,
      })),
      skipDuplicates: true,
    });

    await job.updateProgress((i + batch.length) / items.length * 100);
  }

  return items.length;
}

async function processInterchangeFile(
  fileBuffer: Buffer,
  projectId: string,
  job: Job<ParseFileJobData>
): Promise<number> {
  const items = await processExcelFile(fileBuffer, 'interchange');
  const BATCH_SIZE = 1000;

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);

    await prisma.interchange.createMany({
      data: batch.map((item: any) => ({
        projectId,
        oursPartNumber: item.arnoldSku,
        theirsPartNumber: item.supplierSku,
        source: item.source || 'file',
        confidence: item.confidence || 1.0,
      })),
      skipDuplicates: true,
    });

    await job.updateProgress((i + batch.length) / items.length * 100);
  }

  return items.length;
}

async function processEricFile(
  fileBuffer: Buffer,
  projectId: string,
  job: Job<ParseFileJobData>
): Promise<number> {
  const items = await processExcelFile(fileBuffer, 'eric');
  const BATCH_SIZE = 1000;

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);

    // Upsert inventory items (merge with existing Arnold data)
    for (const item of batch) {
      await prisma.inventoryItem.upsert({
        where: {
          projectId_partNumber: {
            projectId,
            partNumber: item.partNumber,
          },
        },
        update: {
          description: item.description,
          price: item.price,
        },
        create: {
          projectId,
          partNumber: item.partNumber,
          description: item.description,
          price: item.price,
          partNumberNorm: item.partNumberNorm,
          lineCode: item.lineCode,
          rawData: item.rawData,
        },
      });
    }

    await job.updateProgress((i + batch.length) / items.length * 100);
  }

  return items.length;
}

/**
 * Worker event listeners
 */

worker.on('completed', (job) => {
  console.log(`[parse-file] Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`[parse-file] Job ${job?.id} failed:`, err);
});

worker.on('error', (err) => {
  console.error('[parse-file] Worker error:', err);
});

console.log('[parse-file] Worker started');

/**
 * Graceful shutdown
 */

process.on('SIGTERM', async () => {
  console.log('[parse-file] SIGTERM received, shutting down gracefully...');
  await worker.close();
  await prisma.$disconnect();
  await connection.quit();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[parse-file] SIGINT received, shutting down gracefully...');
  await worker.close();
  await prisma.$disconnect();
  await connection.quit();
  process.exit(0);
});
