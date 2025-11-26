/**
 * Process Upload API - Enhanced with Sprint 1 Normalization
 * Downloads file from Supabase Storage and imports to database
 * This bypasses Vercel's 4.5MB body size limit
 * 
 * NEW: Applies line code extraction and punctuation normalization
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import prisma from '@/app/lib/db/prisma';
import * as XLSX from 'xlsx';
import { normalizePartNumber, extractLineCode, excelLeft, excelMid } from '@/app/lib/normalization';

// Legacy normalization (kept for backward compatibility)
function legacyNormalizePartNumber(partNumber: string): string {
  return partNumber.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Handle Excel formulas in cells
 * If a cell contains a formula like =LEFT(A2,3), we need to evaluate it
 * For now, we'll try to extract the actual value from the cell
 */
function getCellValue(cell: any, row: any, columnName: string): string {
  const value = row[columnName];
  
  if (value === undefined || value === null) {
    return '';
  }

  // If it's a formula (starts with =), return empty string
  // The actual value should be in the cell's computed value
  if (typeof value === 'string' && value.startsWith('=')) {
    return '';
  }

  return String(value).trim();
}

/**
 * Process store inventory file with enhanced normalization
 */
function processStoreFile(data: any[], projectId: string) {
  return data.map((row: any) => {
    // Get PART column (may be formula or actual value)
    let partFull = getCellValue(row, row, 'PART') || getCellValue(row, row, 'Part');
    
    // Get LINE and PART NUMBER columns
    let lineCode: any = getCellValue(row, row, 'LINE') || getCellValue(row, row, 'Line');
    let partNumber: any = getCellValue(row, row, 'PART NUMBER') || getCellValue(row, row, 'Part Number');

    // Check if LINE or PART NUMBER contain Excel formulas (starts with =)
    const lineHasFormula = typeof lineCode === 'string' && lineCode.trim().startsWith('=');
    const partNumberHasFormula = typeof partNumber === 'string' && partNumber.trim().startsWith('=');
    
    // If columns contain formulas, ignore them
    if (lineHasFormula) lineCode = null;
    if (partNumberHasFormula) partNumber = null;

    // If PART is empty or formula, concatenate LINE + PART NUMBER (if they're valid)
    if (!partFull && lineCode && partNumber) {
      partFull = lineCode + partNumber;
    }

    // Apply normalization - this will extract line code from PART column
    const normalized = normalizePartNumber(partFull, { extractLineCode: true });

    // Use extracted values from normalization (don't trust formula columns)
    const finalLineCode = normalized.lineCode || null;
    const finalMfrPartNumber = normalized.mfrPartNumber || null;

    return {
      projectId,
      partNumber: partFull,
      partFull,
      partNumberNorm: normalized.normalized,
      lineCode: finalLineCode,
      mfrPartNumber: finalMfrPartNumber,
      canonicalPartNumber: normalized.canonical,
      description: getCellValue(row, row, 'DESCRIPTION') || getCellValue(row, row, 'Description') || null,
      currentCost: parseFloat(row['CURR COST $'] || row['COST $'] || row['Cost'] || 0) || null,
      quantity: parseInt(row['QTY AVL'] || row['QTY AVAIL'] || row['Qty Available'] || 0) || null,
      rollingUsage: parseInt(row['ROLLING 12'] || row['Usage'] || 0) || null,
      rawData: row,
    };
  });
}

/**
 * Process supplier catalog file with enhanced normalization
 */
function processSupplierFile(data: any[], projectId: string) {
  return data.map((row: any) => {
    // Get PART column (may be formula or actual value)
    let partFull = getCellValue(row, row, 'PART') || getCellValue(row, row, 'Part');
    
    // Get LINE and PART NUMBER columns
    let lineCode: any = getCellValue(row, row, 'LINE') || getCellValue(row, row, 'Line');
    let partNumber: any = getCellValue(row, row, 'PART NUMBER') || getCellValue(row, row, 'Part Number');

    // Check if LINE or PART NUMBER contain Excel formulas (starts with =)
    const lineHasFormula = typeof lineCode === 'string' && lineCode.trim().startsWith('=');
    const partNumberHasFormula = typeof partNumber === 'string' && partNumber.trim().startsWith('=');
    
    // If columns contain formulas, ignore them
    if (lineHasFormula) lineCode = null;
    if (partNumberHasFormula) partNumber = null;

    // If PART is empty or formula, concatenate LINE + PART NUMBER (if they're valid)
    if (!partFull && lineCode && partNumber) {
      partFull = lineCode + partNumber;
    }

    // Apply normalization - this will extract line code from PART column
    const normalized = normalizePartNumber(partFull, { extractLineCode: true });

    // Use extracted values from normalization (don't trust formula columns)
    const finalLineCode = normalized.lineCode || null;
    const finalMfrPartNumber = normalized.mfrPartNumber || null;

    return {
      projectId,
      supplier: 'CarQuest', // Default supplier name
      partNumber: partFull,
      partFull,
      partNumberNorm: normalized.normalized,
      lineCode: finalLineCode,
      mfrPartNumber: finalMfrPartNumber,
      canonicalPartNumber: normalized.canonical,
      description: getCellValue(row, row, 'DESCRIPTION') || getCellValue(row, row, 'Description') || null,
      currentCost: parseFloat(row['COST $'] || row[' COST $'] || row['Cost'] || 0) || null,
      quantity: parseInt(row['QTY AVAIL'] || row['Qty Available'] || 0) || null,
      ytdHist: parseInt(row['YTD HIST'] || 0) || null,
      rawData: row,
    };
  });
}

/**
 * Process interchange file with enhanced normalization
 */
function processInterchangeFile(data: any[], projectId: string) {
  const interchanges: any[] = [];
  const interchangeMappings: any[] = [];

  // Log column names for debugging
  if (data.length > 0) {
    const columnNames = Object.keys(data[0]);
    console.log('[INTERCHANGE] Column names found:', columnNames);
  }

  for (const row of data) {
    // Try to find vendor/supplier part column (try all possible names)
    let supplierSku = '';
    const supplierColumns = [
      'Supplier SKU', 'Their SKU', 'Competitor SKU',
      'VENDOR PART #', 'Vendor Part #', 'VENDOR PART NUMBER',
      'Vendor Part Number', 'vendor part #', 'vendor part number'
    ];
    
    for (const col of supplierColumns) {
      if (row[col]) {
        supplierSku = String(row[col]).trim();
        break;
      }
    }
    
    // Also try with trimmed column names (handle leading/trailing spaces)
    if (!supplierSku) {
      for (const key of Object.keys(row)) {
        const trimmedKey = key.trim().toUpperCase();
        if (trimmedKey.includes('VENDOR') && trimmedKey.includes('PART')) {
          supplierSku = String(row[key]).trim();
          break;
        }
      }
    }
    
    // Try to find Merrill/Arnold/Store part column
    let storeSku = '';
    const storeColumns = [
      'Store SKU', 'Our SKU', 'Arnold SKU',
      'MERRILL PART #', 'Merrill Part #', 'MERRILL PART NUMBER',
      'Merrill Part Number', 'merrill part #', 'merrill part number',
      ' MERRILL PART #'  // Handle leading space
    ];
    
    for (const col of storeColumns) {
      if (row[col]) {
        storeSku = String(row[col]).trim();
        break;
      }
    }
    
    // Also try with trimmed column names
    if (!storeSku) {
      for (const key of Object.keys(row)) {
        const trimmedKey = key.trim().toUpperCase();
        if (trimmedKey.includes('MERRILL') && trimmedKey.includes('PART')) {
          storeSku = String(row[key]).trim();
          break;
        }
      }
    }

    // Skip rows with no interchange or invalid data
    if (!supplierSku || !storeSku || supplierSku === 'NO INTERCHANGE' || storeSku === 'NO INTERCHANGE') {
      continue;
    }

    // Add to legacy interchange table
    interchanges.push({
      projectId,
      oursPartNumber: storeSku,
      theirsPartNumber: supplierSku,
      source: 'file',
      confidence: 1.0,
    });

    // Add to new InterchangeMapping table with normalization
    const supplierNorm = normalizePartNumber(supplierSku, { extractLineCode: true });
    const storeNorm = normalizePartNumber(storeSku, { extractLineCode: true });

    // IMPORTANT: The Excel file has columns backwards!
    // "VENDOR PART #" actually contains Arnold parts (AXLGM-*)
    // "MERRILL PART #" actually contains competitor parts (GM-*, NCV*)
    // So we swap them here:
    interchangeMappings.push({
      competitorFullSku: storeSku,  // storeSku is actually the competitor part
      competitorLineCode: storeNorm.lineCode,
      competitorPartNumber: storeNorm.mfrPartNumber,
      arnoldFullSku: supplierSku,  // supplierSku is actually the Arnold part
      arnoldLineCode: supplierNorm.lineCode,
      arnoldPartNumber: supplierNorm.mfrPartNumber,
      source: 'file_import',
      confidence: 1.0,
    });
  }

  console.log(`[INTERCHANGE] Processed ${interchangeMappings.length} interchange mappings from ${data.length} rows`);
  return { interchanges, interchangeMappings };
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { projectId, fileUrl, fileType, fileName } = body;

    if (!projectId || !fileUrl || !fileType) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Verify project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      return NextResponse.json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      );
    }

    console.log(`[UPLOAD] Processing ${fileType} file: ${fileName}`);

    // Download file from Supabase Storage
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error('Failed to download file from storage');
    }

    const buffer = await response.arrayBuffer();
    
    // Parse Excel file with formula evaluation
    const workbook = XLSX.read(buffer, { 
      type: 'array',
      cellFormula: false, // Don't preserve formulas
      cellText: false,    // Use calculated values
    });
    
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    if (data.length === 0) {
      return NextResponse.json(
        { success: false, error: 'File is empty' },
        { status: 400 }
      );
    }

    console.log(`[UPLOAD] Parsed ${data.length} rows from ${sheetName}`);

    // Import data based on file type
    let importedCount = 0;
    
    // Process in batches to avoid timeout
    const BATCH_SIZE = 1000;
    
    if (fileType === 'store') {
      const items = processStoreFile(data, project.id);
      
      console.log(`[UPLOAD] Processing ${items.length} store items in batches of ${BATCH_SIZE}`);
      
      // Process in batches
      for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const batch = items.slice(i, i + BATCH_SIZE);
        await prisma.storeItem.createMany({
          data: batch,
          skipDuplicates: true,
        });
        console.log(`[UPLOAD] Imported batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} items`);
      }
      importedCount = items.length;
      
    } else if (fileType === 'supplier') {
      const items = processSupplierFile(data, project.id);
      
      console.log(`[UPLOAD] Processing ${items.length} supplier items in batches of ${BATCH_SIZE}`);
      
      // Process in batches
      for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const batch = items.slice(i, i + BATCH_SIZE);
        await prisma.supplierItem.createMany({
          data: batch,
          skipDuplicates: true,
        });
        console.log(`[UPLOAD] Imported batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} items`);
      }
      importedCount = items.length;
      
    } else if (fileType === 'interchange') {
      const { interchanges, interchangeMappings } = processInterchangeFile(data, project.id);
      
      console.log(`[UPLOAD] Processing ${interchanges.length} interchanges`);
      
      // Import legacy interchanges
      for (let i = 0; i < interchanges.length; i += BATCH_SIZE) {
        const batch = interchanges.slice(i, i + BATCH_SIZE);
        await prisma.interchange.createMany({
          data: batch,
          skipDuplicates: true,
        });
      }

      // Import enhanced interchange mappings
      for (let i = 0; i < interchangeMappings.length; i += BATCH_SIZE) {
        const batch = interchangeMappings.slice(i, i + BATCH_SIZE);
        await prisma.interchangeMapping.createMany({
          data: batch,
          skipDuplicates: true,
        });
      }
      
      importedCount = interchanges.length;
    }

    // Update project timestamp
    await prisma.project.update({
      where: { id: project.id },
      data: { updatedAt: new Date() },
    });

    console.log(`[UPLOAD] Successfully imported ${importedCount} rows`);

    return NextResponse.json({
      success: true,
      message: `Imported ${importedCount} rows with enhanced normalization`,
      projectId: project.id,
      projectName: project.name,
      rowCount: importedCount,
      fileType,
    });
  } catch (error: any) {
    console.error('[UPLOAD] Error processing file:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to process file' },
      { status: 500 }
    );
  }
}
