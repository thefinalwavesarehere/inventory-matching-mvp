/**
 * Process Upload API
 * Downloads file from Supabase Storage and imports to database
 * This bypasses Vercel's 4.5MB body size limit
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import prisma from '@/app/lib/db/prisma';
import * as XLSX from 'xlsx';

// Normalize part number
function normalizePartNumber(partNumber: string): string {
  return partNumber.toUpperCase().replace(/[^A-Z0-9]/g, '');
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

    // Download file from Supabase Storage
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error('Failed to download file from storage');
    }

    const buffer = await response.arrayBuffer();
    
    // Parse Excel file
    const workbook = XLSX.read(buffer, { type: 'array' });
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

    // Update project timestamp
    await prisma.project.update({
      where: { id: project.id },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json({
      success: true,
      message: `Imported ${importedCount} rows`,
      projectId: project.id,
      projectName: project.name,
      rowCount: importedCount,
      fileType,
    });
  } catch (error: any) {
    console.error('Error processing file:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to process file' },
      { status: 500 }
    );
  }
}
