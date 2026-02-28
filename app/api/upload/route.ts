/**
 * Upload API
 * 
 * GET  /api/upload - List projects with upload stats
 * POST /api/upload - Upload and parse file
 */

import { NextRequest, NextResponse } from 'next/server';
// Migrated to Supabase auth
import prisma from '@/app/lib/db/prisma';
import * as XLSX from 'xlsx';

import { withAuth } from '@/app/lib/middleware/auth';
import { apiLogger } from '@/app/lib/structured-logger';
import { withRateLimit } from '@/app/lib/middleware/rate-limit';
// V9.5: Set maximum duration for large file uploads
export const maxDuration = 60;

// V9.5: Strict sanitization - removes all non-alphanumeric characters
// Example: "000-2112-73" becomes "000211273"
function normalizePartNumber(partNumber: string): string {
  return partNumber.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export async function GET(req: NextRequest) {
  return withAuth(req, async (context) => {
    try {
    // Require authentication

    // Return projects with upload session info (for backward compatibility)
    const projects = await prisma.project.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            storeItems: true,
            supplierItems: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      projects: projects.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
        uploadSessions: [], // Legacy field for compatibility
        _count: {
          uploadSessions: p._count.storeItems + p._count.supplierItems,
        },
      })),
    });
  
  } catch (error: any) {
    apiLogger.error({ error: error.message }, 'Handler error');
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
  });
}

export async function POST(req: NextRequest) {
  return withRateLimit(req, 'api', () => withAuth(req, async (context) => {
    try {
    // Require authentication

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const fileType = formData.get('fileType') as string;
    const projectId = formData.get('projectId') as string;
    const projectName = formData.get('projectName') as string;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      );
    }

    if (!fileType || !['store', 'supplier', 'interchange'].includes(fileType)) {
      return NextResponse.json(
        { success: false, error: 'Invalid file type' },
        { status: 400 }
      );
    }

    // Get or create project
    let project;
    if (projectId) {
      project = await prisma.project.findUnique({
        where: { id: projectId },
      });
      if (!project) {
        return NextResponse.json(
          { success: false, error: 'Project not found' },
          { status: 404 }
        );
      }
    } else if (projectName) {
      project = await prisma.project.create({
        data: {
          name: projectName,
        },
      });
    } else {
      return NextResponse.json(
        { success: false, error: 'Project ID or name required' },
        { status: 400 }
      );
    }

    // Parse Excel file
    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    if (data.length === 0) {
      return NextResponse.json(
        { success: false, error: 'File is empty' },
        { status: 400 }
      );
    }

    // Import data based on file type
    let importedCount = 0;
    
    if (fileType === 'store') {
      // Import store inventory items
      const items = data.map((row: any) => {
        const partNumber = String(row['PART NUMBER'] || row['Part Number'] || row['Part'] || '').trim();
        return {
          projectId: project.id,
          partNumber,
          partNumberNorm: normalizePartNumber(partNumber),
          partFull: String(row['PART FULL'] || '').trim() || null,
          description: String(row['DESCRIPTION'] || row['Description'] || '').trim() || null,
          lineCode: String(row['LINE'] || row['Line'] || '').trim() || null,
          currentCost: parseFloat(row['CURR COST $'] || row['Cost'] || 0) || null,
          quantity: parseInt(row['QTY AVL'] || row['Qty Available'] || 0) || null,
          rollingUsage: parseInt(row['ROLLING 12'] || row['Usage'] || 0) || null,
          rawData: row,
        };
      });

      await prisma.storeItem.createMany({
        data: items,
        skipDuplicates: true,
      });
      importedCount = items.length;

      // P3: Apply line code preprocessing after store items uploaded
      try {
        apiLogger.info('[UPLOAD] Applying line code preprocessing...');
        const { applyLineCodePreprocessing } = await import('@/app/lib/line-code-preprocessor');
        const preprocessResult = await applyLineCodePreprocessing(project.id);
        apiLogger.info(`[UPLOAD] Line code preprocessing: ${preprocessResult.itemsMapped}/${preprocessResult.totalItems} items mapped`);
      } catch (error) {
        apiLogger.error('[UPLOAD] Line code preprocessing failed:', error);
        // Don't fail the upload if preprocessing fails
      }
    } else if (fileType === 'supplier') {
      // Import supplier catalog items
      const items = data.map((row: any) => {
        const partNumber = String(row['PART NUMBER'] || row['Part Number'] || row['Part'] || '').trim();
        return {
          projectId: project.id,
          supplier: 'CarQuest', // Default supplier name
          partNumber,
          partNumberNorm: normalizePartNumber(partNumber),
          partFull: String(row['PART FULL'] || '').trim() || null,
          description: String(row['DESCRIPTION'] || row['Description'] || '').trim() || null,
          lineCode: String(row['LINE'] || row['Line'] || '').trim() || null,
          currentCost: parseFloat(row[' COST $'] || row['Cost'] || 0) || null,
          quantity: parseInt(row['QTY AVAIL'] || row['Qty Available'] || 0) || null,
          ytdHist: parseInt(row['YTD HIST'] || 0) || null,
          rawData: row,
        };
      });

      await prisma.supplierItem.createMany({
        data: items,
        skipDuplicates: true,
      });
      importedCount = items.length;
    } else if (fileType === 'interchange') {
      // Import known interchanges
      const items = data.map((row: any) => ({
        projectId: project.id,
        oursPartNumber: String(row['Our SKU'] || row['Store Part'] || '').trim(),
        theirsPartNumber: String(row['Their SKU'] || row['Supplier Part'] || '').trim(),
        source: 'file',
        confidence: 1.0,
      }));

      await prisma.interchange.createMany({
        data: items,
        skipDuplicates: true,
      });
      importedCount = items.length;
    }

    // Auto-setup matching system (creates indexes on first upload)
    const { ensureMatchingSetup, getSetupStatus } = await import('@/app/lib/matching/auto-setup');
    apiLogger.info('[UPLOAD] Running matching system setup...');
    const setupStatus = await ensureMatchingSetup();
    
    if (setupStatus.isReady) {
      apiLogger.info('[UPLOAD] ✅ Matching system ready');
      apiLogger.info(`[UPLOAD] Indexes: ${setupStatus.readyIndexes}/${setupStatus.totalIndexes} complete`);
    } else if (setupStatus.buildingIndexes > 0) {
      apiLogger.info('[UPLOAD] ⏳ Indexes building in background');
      apiLogger.info(`[UPLOAD] Estimated completion: ~${setupStatus.estimatedWaitMins} minutes`);
    } else {
      apiLogger.warn('[UPLOAD] ⚠️  Setup incomplete:', setupStatus.message);
      apiLogger.warn('[UPLOAD] Matching may not work optimally');
    }

    return NextResponse.json({
      success: true,
      message: `Imported ${importedCount} rows`,
      projectId: project.id,
      projectName: project.name,
      rowCount: importedCount,
      setupStatus: {
        isReady: setupStatus.isReady,
        isComplete: setupStatus.isComplete,
        buildingIndexes: setupStatus.buildingIndexes,
        message: setupStatus.message,
        estimatedWaitMins: setupStatus.estimatedWaitMins,
      },
    });
  
  } catch (error: any) {
    apiLogger.error({ error: error.message }, 'Handler error');
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
  }));
}
