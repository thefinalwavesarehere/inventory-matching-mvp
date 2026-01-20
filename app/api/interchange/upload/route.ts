import { NextRequest, NextResponse } from 'next/server';
// Migrated to Supabase auth
import { requireAuth } from '@/app/lib/auth-helpers';
import prisma from '@/app/lib/db/prisma';
import * as XLSX from 'xlsx';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    // Require authentication
    await requireAuth();

    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      );
    }

    console.log('[INTERCHANGE-UPLOAD] Processing file:', file.name);

    // Read file
    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(worksheet);

    console.log(`[INTERCHANGE-UPLOAD] Parsed ${rows.length} rows`);

    // Process rows
    const mappings: any[] = [];

    for (const row of rows) {
      const rowData = row as any;
      
      // Extract columns
      const vendorPart = rowData['VENDOR PART #'] || rowData['Vendor Part #'] || rowData['vendorPartNumber'];
      const merrillPart = rowData['MERRILL PART #'] || rowData['Merrill Part #'] || rowData['merrillPartNumber'];
      const vendor = rowData['VENDOR'] || rowData['Vendor'] || rowData['vendor'];
      const subCategory = rowData['SUB CATEGORY'] || rowData['Sub Category'] || rowData['subCategory'];

      // P3: Optional manufacturer rule flags
      const flagType = rowData['FLAG_TYPE'] || rowData['Flag Type'] || rowData['flagType'] || rowData['flag_type'];
      const flagMessage = rowData['FLAG_MESSAGE'] || rowData['Flag Message'] || rowData['flagMessage'] || rowData['flag_message'];

      if (!vendorPart || !merrillPart) {
        continue; // Skip invalid rows
      }

      // Normalize
      const canonicalNormalize = (part: string) => {
        return String(part).toUpperCase().replace(/[^A-Z0-9]/g, '');
      };

      mappings.push({
        // Legacy fields for compatibility
        competitorFullSku: String(vendorPart),
        arnoldFullSku: String(merrillPart),
        // New fields
        vendorPartNumber: String(vendorPart),
        merrillPartNumber: String(merrillPart),
        vendorPartNumberNorm: canonicalNormalize(vendorPart),
        merrillPartNumberNorm: canonicalNormalize(merrillPart),
        vendor: vendor ? String(vendor) : null,
        subCategory: subCategory ? String(subCategory) : null,
        // P3: Manufacturer rule flags
        flagType: flagType ? String(flagType) : null,
        flagMessage: flagMessage ? String(flagMessage) : null,
        confidence: 1.0,
        source: 'global_upload',
      });
    }

    console.log(`[INTERCHANGE-UPLOAD] Prepared ${mappings.length} mappings`);

    // Clear existing and insert new (GLOBAL REPLACE)
    await prisma.$transaction(async (tx) => {
      await tx.interchange.deleteMany({});
      
      // Insert in batches
      for (let i = 0; i < mappings.length; i += 1000) {
        const batch = mappings.slice(i, i + 1000);
        await tx.interchange.createMany({
          data: batch,
          skipDuplicates: true,
        });
      }
    });

    console.log(`[INTERCHANGE-UPLOAD] Successfully uploaded ${mappings.length} mappings`);

    return NextResponse.json({
      success: true,
      count: mappings.length,
      message: `Uploaded ${mappings.length} global interchange mappings`,
    });

  } catch (error: any) {
    console.error('[INTERCHANGE-UPLOAD] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
