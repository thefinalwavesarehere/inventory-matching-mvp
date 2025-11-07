/**
 * Seed Script for Fresh Installations
 * 
 * Creates:
 * - Admin user
 * - Example project with settings
 * - Sample data for testing
 * 
 * Usage:
 *   npx prisma db seed
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...\n');

  // Create users
  console.log('📝 Creating users...');
  
  const admin = await prisma.user.upsert({
    where: { email: 'admin@arnoldmotorsupply.com' },
    update: {},
    create: {
      email: 'admin@arnoldmotorsupply.com',
      name: 'System Administrator',
      passwordHash: await bcrypt.hash('admin123', 10),
      role: 'ADMIN',
    },
  });
  console.log(`  ✅ Created admin: ${admin.email}`);

  const manager = await prisma.user.upsert({
    where: { email: 'manager@arnoldmotorsupply.com' },
    update: {},
    create: {
      email: 'manager@arnoldmotorsupply.com',
      name: 'Project Manager',
      passwordHash: await bcrypt.hash('manager123', 10),
      role: 'MANAGER',
    },
  });
  console.log(`  ✅ Created manager: ${manager.email}`);

  const reviewer = await prisma.user.upsert({
    where: { email: 'reviewer@arnoldmotorsupply.com' },
    update: {},
    create: {
      email: 'reviewer@arnoldmotorsupply.com',
      name: 'Match Reviewer',
      passwordHash: await bcrypt.hash('reviewer123', 10),
      role: 'REVIEWER',
    },
  });
  console.log(`  ✅ Created reviewer: ${reviewer.email}`);

  const uploader = await prisma.user.upsert({
    where: { email: 'uploader@arnoldmotorsupply.com' },
    update: {},
    create: {
      email: 'uploader@arnoldmotorsupply.com',
      name: 'File Uploader',
      passwordHash: await bcrypt.hash('uploader123', 10),
      role: 'UPLOADER',
    },
  });
  console.log(`  ✅ Created uploader: ${uploader.email}\n`);

  // Create example project
  console.log('📝 Creating example project...');
  
  const project = await prisma.project.create({
    data: {
      name: 'Example Project',
      description: 'Sample project for testing the inventory matching system',
    },
  });
  console.log(`  ✅ Created project: ${project.name}\n`);

  // Create project settings
  console.log('📝 Creating project settings...');
  
  const settings = await prisma.projectSettings.create({
    data: {
      projectId: project.id,
      autoConfirmMin: 0.92,
      reviewBandMin: 0.65,
      autoRejectMax: 0.40,
      aiEnabled: false,
      normalizationRules: {
        prefixes: ['XBO', 'RDS', 'LUB', 'AXL', 'AUV', 'RDSNC', 'RDSNCV'],
        lineCodes: ['ABC', 'ACD', 'AXL', 'AUV', 'LUB', 'RDS', 'XBO'],
      },
    },
  });
  console.log(`  ✅ Created settings for project\n`);

  // Create sample files
  console.log('📝 Creating sample files...');
  
  const arnoldFile = await prisma.file.create({
    data: {
      projectId: project.id,
      kind: 'ARNOLD',
      originalName: 'arnold_inventory.xlsx',
      storageKey: 'uploads/arnold_inventory.xlsx',
      sizeBytes: 1024000,
      status: 'PARSED',
      parsedAt: new Date(),
      rowCount: 100,
    },
  });
  console.log(`  ✅ Created Arnold file`);

  const supplierFile = await prisma.file.create({
    data: {
      projectId: project.id,
      kind: 'SUPPLIER',
      originalName: 'carquest_catalog.xlsx',
      storageKey: 'uploads/carquest_catalog.xlsx',
      sizeBytes: 2048000,
      status: 'PARSED',
      parsedAt: new Date(),
      rowCount: 500,
    },
  });
  console.log(`  ✅ Created Supplier file`);

  const storeFile = await prisma.file.create({
    data: {
      projectId: project.id,
      kind: 'STORE',
      originalName: 'store_inventory.xlsx',
      storageKey: 'uploads/store_inventory.xlsx',
      sizeBytes: 512000,
      status: 'PARSED',
      parsedAt: new Date(),
      rowCount: 50,
    },
  });
  console.log(`  ✅ Created Store file\n`);

  // Create import runs
  console.log('📝 Creating import runs...');
  
  await prisma.importRun.create({
    data: {
      projectId: project.id,
      fileId: arnoldFile.id,
      startedAt: new Date(Date.now() - 60000),
      finishedAt: new Date(),
      status: 'SUCCEEDED',
      rowsProcessed: 100,
    },
  });

  await prisma.importRun.create({
    data: {
      projectId: project.id,
      fileId: supplierFile.id,
      startedAt: new Date(Date.now() - 120000),
      finishedAt: new Date(),
      status: 'SUCCEEDED',
      rowsProcessed: 500,
    },
  });

  await prisma.importRun.create({
    data: {
      projectId: project.id,
      fileId: storeFile.id,
      startedAt: new Date(Date.now() - 30000),
      finishedAt: new Date(),
      status: 'SUCCEEDED',
      rowsProcessed: 50,
    },
  });
  console.log(`  ✅ Created import runs\n`);

  // Create sample inventory items
  console.log('📝 Creating sample inventory items...');
  
  const sampleParts = [
    { pn: 'AXLCH-8365', desc: 'CV Shaft Assembly', price: 151.31, cost: 120.00, usage: 16 },
    { pn: 'AXLSB-8001', desc: 'CV Axle Assembly', price: 52.48, cost: 42.00, usage: 3 },
    { pn: 'AXLFD-8145', desc: 'Front Drive Shaft', price: 71.34, cost: 58.00, usage: 3 },
  ];

  for (const part of sampleParts) {
    const { lineCode, partNumber } = extractLineCode(part.pn);
    await prisma.inventoryItem.create({
      data: {
        projectId: project.id,
        partNumber: part.pn,
        description: part.desc,
        price: part.price,
        cost: part.cost,
        totalLastUsage: part.usage,
        partNumberNorm: normalizePartNumber(part.pn),
        lineCode,
      },
    });
  }
  console.log(`  ✅ Created ${sampleParts.length} inventory items\n`);

  // Create sample supplier items
  console.log('📝 Creating sample supplier items...');
  
  const sampleSupplier = [
    { pn: 'XBOAXLCH8365', line: 'XBO', desc: 'CV SHAFTS', cost: 125.00, qty: 1 },
    { pn: 'LUB8064', line: 'LUB', desc: 'DIESEL 911', cost: null, qty: 25 },
  ];

  for (const part of sampleSupplier) {
    await prisma.supplierItem.create({
      data: {
        projectId: project.id,
        supplier: 'CarQuest',
        partNumber: part.pn.replace(part.line, ''),
        partFull: part.pn,
        description: part.desc,
        currentCost: part.cost,
        quantity: part.qty,
        partNumberNorm: normalizePartNumber(part.pn),
        lineCode: part.line,
      },
    });
  }
  console.log(`  ✅ Created ${sampleSupplier.length} supplier items\n`);

  // Create sample store items
  console.log('📝 Creating sample store items...');
  
  const sampleStore = [
    { pn: 'AXLCH-8365', desc: null, cost: 151.31, qty: 1, usage: 16 },
    { pn: 'AXLVO-8064', desc: null, cost: 116.78, qty: 1, usage: null },
  ];

  for (const part of sampleStore) {
    const { lineCode } = extractLineCode(part.pn);
    await prisma.storeItem.create({
      data: {
        projectId: project.id,
        partNumber: part.pn,
        partFull: part.pn,
        description: part.desc,
        currentCost: part.cost,
        quantity: part.qty,
        rollingUsage: part.usage,
        partNumberNorm: normalizePartNumber(part.pn),
        lineCode,
      },
    });
  }
  console.log(`  ✅ Created ${sampleStore.length} store items\n`);

  // Create audit log entry
  console.log('📝 Creating audit log entry...');
  
  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      projectId: project.id,
      entity: 'Project',
      entityId: project.id,
      action: 'SEED',
      meta: {
        seededAt: new Date().toISOString(),
        script: 'seed.ts',
      },
    },
  });
  console.log(`  ✅ Created audit log entry\n`);

  console.log('🎉 Seeding completed successfully!\n');
  console.log('📊 Summary:');
  console.log(`  - Users: 4 (admin, manager, reviewer, uploader)`);
  console.log(`  - Projects: 1`);
  console.log(`  - Files: 3`);
  console.log(`  - Inventory Items: ${sampleParts.length}`);
  console.log(`  - Supplier Items: ${sampleSupplier.length}`);
  console.log(`  - Store Items: ${sampleStore.length}`);
  console.log('\n🔐 Default Credentials:');
  console.log('  Admin:    admin@arnoldmotorsupply.com / admin123');
  console.log('  Manager:  manager@arnoldmotorsupply.com / manager123');
  console.log('  Reviewer: reviewer@arnoldmotorsupply.com / reviewer123');
  console.log('  Uploader: uploader@arnoldmotorsupply.com / uploader123');
  console.log('\n⚠️  IMPORTANT: Change these passwords in production!\n');
}

// Helper functions
function normalizePartNumber(pn: string): string {
  if (!pn) return '';
  
  const prefixes = ['XBO', 'RDS', 'LUB', 'AXL', 'AUV', 'RDSNC', 'RDSNCV'];
  let normalized = pn.toUpperCase().trim();
  
  for (const prefix of prefixes) {
    if (normalized.startsWith(prefix)) {
      normalized = normalized.substring(prefix.length);
      break;
    }
  }
  
  normalized = normalized.replace(/[\s\-]/g, '');
  
  return normalized;
}

function extractLineCode(pn: string): { lineCode: string | null; partNumber: string } {
  if (!pn) return { lineCode: null, partNumber: '' };
  
  const normalized = pn.toUpperCase().trim();
  const match = normalized.match(/^([A-Z]{2,4})[\-\s]?(.+)$/);
  
  if (match) {
    return {
      lineCode: match[1],
      partNumber: match[2],
    };
  }
  
  return { lineCode: null, partNumber: normalized };
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
