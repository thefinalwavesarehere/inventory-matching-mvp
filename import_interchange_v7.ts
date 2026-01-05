import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import * as path from 'path';

const prisma = new PrismaClient();

/**
 * V7.1 ROSETTA STONE - Hardcoded Interchange Import
 * 
 * Imports AI INTERCHANGE DATA.xlsx with explicit column mapping:
 * - MERRILL PART # → competitorFullSku (Store/Input part)
 * - VENDOR PART # → arnoldFullSku (Supplier/Target part)
 */

async function importInterchangeData() {
  console.log('=== V7.1 ROSETTA STONE - INTERCHANGE IMPORT ===\n');
  
  const filePath = process.argv[2] || '/home/ubuntu/upload/AIINTERCHANGEDATA.xlsx';
  
  console.log(`Reading file: ${filePath}`);
  
  // Read Excel file
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  // Convert to JSON with header row
  const data = XLSX.utils.sheet_to_json(worksheet);
  
  console.log(`Found ${data.length} rows in Excel file\n`);
  
  // Get or create master project ID
  let masterProject = await prisma.project.findFirst({
    where: { name: 'Master Interchange' }
  });
  
  if (!masterProject) {
    console.log('Creating Master Interchange project...');
    masterProject = await prisma.project.create({
      data: {
        name: 'Master Interchange',
        description: 'Global interchange mappings for all stores'
      }
    });
    console.log(`✓ Created project: ${masterProject.id}\n`);
  } else {
    console.log(`✓ Using existing project: ${masterProject.id}\n`);
  }
  
  // Clear existing interchange data for this project
  const deleted = await prisma.interchange.deleteMany({
    where: { projectId: masterProject.id }
  });
  console.log(`Cleared ${deleted.count} existing interchange records\n`);
  
  // Import data with hardcoded mapping
  let imported = 0;
  let skipped = 0;
  
  console.log('Importing interchange data...\n');
  
  for (const row of data as any[]) {
    // Hardcoded column mapping
    const merrillPart = row[' MERRILL PART #'] || row['MERRILL PART #'];
    const vendorPart = row['VENDOR PART #'];
    const vendor = row['VENDOR'];
    const subCategory = row['SUB CATEGORY'];
    
    if (!merrillPart || !vendorPart) {
      skipped++;
      continue;
    }
    
    try {
      await prisma.interchange.create({
        data: {
          projectId: masterProject.id,
          oursPartNumber: String(vendorPart).trim(),      // Arnold/Supplier part
          theirsPartNumber: String(merrillPart).trim(),   // Merrill/Store part
          source: `AI_INTERCHANGE_${vendor || 'UNKNOWN'}`,
          confidence: 1.0
        }
      });
      imported++;
      
      if (imported % 100 === 0) {
        console.log(`  Imported ${imported} records...`);
      }
    } catch (error: any) {
      if (error.code !== 'P2002') { // Ignore duplicate key errors
        console.error(`Error importing row:`, error.message);
      }
      skipped++;
    }
  }
  
  console.log(`\n✓ Import complete!`);
  console.log(`  Imported: ${imported}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Total: ${data.length}\n`);
  
  // Verify import with sample queries
  console.log('=== VERIFICATION SAMPLES ===\n');
  
  const sampleParts = ['ABC10033A', '10033A', 'NCV10028'];
  
  for (const part of sampleParts) {
    const matches = await prisma.interchange.findMany({
      where: {
        OR: [
          { oursPartNumber: { contains: part, mode: 'insensitive' } },
          { theirsPartNumber: { contains: part, mode: 'insensitive' } }
        ]
      },
      take: 3
    });
    
    console.log(`Search: "${part}"`);
    if (matches.length > 0) {
      matches.forEach(m => {
        console.log(`  ${m.theirsPartNumber} → ${m.oursPartNumber} (${m.source})`);
      });
    } else {
      console.log(`  No matches found`);
    }
    console.log('');
  }
  
  await prisma.$disconnect();
}

importInterchangeData().catch((error) => {
  console.error('Import failed:', error);
  process.exit(1);
});
