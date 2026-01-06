#!/usr/bin/env tsx
/**
 * V4 Interchange Backfill Script
 * 
 * Populates V4 normalized columns for existing interchange data.
 * 
 * Usage:
 *   npx tsx scripts/backfill-v4-interchange.ts [projectId]
 * 
 * If projectId is provided, only backfills that project.
 * Otherwise, backfills all projects with NULL normalized fields.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * V4 Canonical Normalization
 * UPPERCASE + remove all non-alphanumerics
 * DO NOT strip prefixes
 * 
 * Examples:
 *   AXLGM-8167 → AXLGM8167
 *   NCV10028 → NCV10028
 *   16-803 → 16803
 */
function canonicalNormalize(part: string): string {
  return String(part).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

async function backfillProject(projectId: string) {
  console.log(`[V4-BACKFILL] Starting backfill for project: ${projectId}`);
  
  // Find interchange rows with NULL normalized fields
  const toBackfill = await prisma.interchange.findMany({
    where: {
      projectId,
      merrillPartNumberNorm: null,
    },
    select: {
      id: true,
      oursPartNumber: true,
      theirsPartNumber: true,
    },
  });
  
  console.log(`[V4-BACKFILL] Found ${toBackfill.length} rows to backfill`);
  
  if (toBackfill.length === 0) {
    console.log(`[V4-BACKFILL] No rows need backfill for project ${projectId}`);
    return 0;
  }
  
  // Backfill each row
  let backfilled = 0;
  for (const row of toBackfill) {
    try {
      await prisma.interchange.update({
        where: { id: row.id },
        data: {
          // Map legacy fields to V4 fields
          merrillPartNumber: row.theirsPartNumber,
          merrillPartNumberNorm: canonicalNormalize(row.theirsPartNumber),
          vendorPartNumber: row.oursPartNumber,
          vendorPartNumberNorm: canonicalNormalize(row.oursPartNumber),
          // vendor, lineCode, subCategory, notes remain NULL
          // These require re-upload with CSV VENDOR column
        },
      });
      backfilled++;
      
      if (backfilled % 100 === 0) {
        console.log(`[V4-BACKFILL] Progress: ${backfilled}/${toBackfill.length}`);
      }
    } catch (error) {
      console.error(`[V4-BACKFILL] Error backfilling row ${row.id}:`, error);
    }
  }
  
  console.log(`[V4-BACKFILL] Backfilled ${backfilled} rows for project ${projectId}`);
  console.log(`[V4-BACKFILL] NOTE: Vendor metadata (VENDOR column) requires re-upload of interchange file`);
  
  return backfilled;
}

async function backfillAll() {
  console.log(`[V4-BACKFILL] Starting backfill for all projects`);
  
  // Find all projects with interchange data needing backfill
  const projects = await prisma.interchange.findMany({
    where: {
      merrillPartNumberNorm: null,
    },
    select: {
      projectId: true,
    },
    distinct: ['projectId'],
  });
  
  console.log(`[V4-BACKFILL] Found ${projects.length} projects needing backfill`);
  
  let totalBackfilled = 0;
  for (const { projectId } of projects) {
    const count = await backfillProject(projectId);
    totalBackfilled += count;
  }
  
  console.log(`[V4-BACKFILL] Total backfilled: ${totalBackfilled} rows across ${projects.length} projects`);
  
  return totalBackfilled;
}

async function main() {
  const projectId = process.argv[2];
  
  try {
    if (projectId) {
      console.log(`[V4-BACKFILL] Mode: Single project (${projectId})`);
      await backfillProject(projectId);
    } else {
      console.log(`[V4-BACKFILL] Mode: All projects`);
      await backfillAll();
    }
    
    console.log(`[V4-BACKFILL] Backfill complete`);
    console.log(`[V4-BACKFILL] IMPORTANT: Re-upload interchange files to populate vendor metadata`);
  } catch (error) {
    console.error(`[V4-BACKFILL] Fatal error:`, error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
