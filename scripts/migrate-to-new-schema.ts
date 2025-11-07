/**
 * Migration Script: Old Schema → New Schema
 * 
 * This script migrates data from the old MVP schema to the new spec-compliant schema.
 * 
 * Old Schema:
 * - Project → UploadSession → ArnoldInventory, SupplierCatalog
 * - MatchResult, UnmatchedPart, KnownInterchange
 * 
 * New Schema:
 * - Project → File → ImportRun
 * - InventoryItem (Arnold data), SupplierItem, StoreItem
 * - MatchCandidate, Interchange, AuditLog
 * 
 * Usage:
 *   npx tsx scripts/migrate-to-new-schema.ts
 */

import { PrismaClient as OldPrismaClient } from '@prisma/client';
import { PrismaClient as NewPrismaClient } from '../prisma/generated/new-client';
import * as bcrypt from 'bcryptjs';

const oldDb = new OldPrismaClient();
const newDb = new NewPrismaClient();

async function main() {
  console.log('🚀 Starting migration from old schema to new schema...\n');

  try {
    // Step 1: Create default admin user
    console.log('📝 Step 1: Creating default admin user...');
    const adminUser = await newDb.user.create({
      data: {
        email: 'admin@arnoldmotorsupply.com',
        name: 'System Administrator',
        passwordHash: await bcrypt.hash('admin123', 10), // Change this!
        role: 'ADMIN',
      },
    });
    console.log(`✅ Created admin user: ${adminUser.email}\n`);

    // Step 2: Migrate Projects
    console.log('📝 Step 2: Migrating projects...');
    const oldProjects = await oldDb.project.findMany();
    const projectMap = new Map<string, string>(); // old ID → new ID

    for (const oldProject of oldProjects) {
      const newProject = await newDb.project.create({
        data: {
          name: oldProject.name,
          description: oldProject.description,
          createdAt: oldProject.createdAt,
          updatedAt: oldProject.updatedAt,
        },
      });
      projectMap.set(oldProject.id, newProject.id);
      console.log(`  ✅ Migrated project: ${newProject.name}`);

      // Create default settings for project
      await newDb.projectSettings.create({
        data: {
          projectId: newProject.id,
          autoConfirmMin: 0.92,
          reviewBandMin: 0.65,
          autoRejectMax: 0.40,
          aiEnabled: false,
        },
      });
    }
    console.log(`✅ Migrated ${oldProjects.length} projects\n`);

    // Step 3: Migrate UploadSessions → Files
    console.log('📝 Step 3: Migrating upload sessions to files...');
    const oldSessions = await oldDb.uploadSession.findMany();
    const sessionMap = new Map<string, string>(); // old session ID → new file ID

    for (const oldSession of oldSessions) {
      const newProjectId = projectMap.get(oldSession.projectId);
      if (!newProjectId) {
        console.warn(`  ⚠️  Skipping session ${oldSession.id}: project not found`);
        continue;
      }

      // Determine file kind from fileType
      let fileKind: 'ARNOLD' | 'SUPPLIER' | 'INTERCHANGE' | 'STORE' = 'ARNOLD';
      if (oldSession.fileType === 'supplier') fileKind = 'SUPPLIER';
      else if (oldSession.fileType === 'interchange') fileKind = 'INTERCHANGE';
      else if (oldSession.fileType === 'inventory_report') fileKind = 'STORE';

      const newFile = await newDb.file.create({
        data: {
          projectId: newProjectId,
          kind: fileKind,
          originalName: oldSession.fileName,
          storageKey: oldSession.fileName, // Adjust if using S3
          sizeBytes: 0, // Unknown from old schema
          status: oldSession.status === 'completed' ? 'PARSED' : 'FAILED',
          parsedAt: oldSession.status === 'completed' ? oldSession.uploadedAt : null,
          rowCount: oldSession.rowCount,
          createdAt: oldSession.uploadedAt,
          updatedAt: oldSession.uploadedAt,
        },
      });
      sessionMap.set(oldSession.id, newFile.id);

      // Create ImportRun
      await newDb.importRun.create({
        data: {
          projectId: newProjectId,
          fileId: newFile.id,
          startedAt: oldSession.uploadedAt,
          finishedAt: oldSession.uploadedAt,
          status: oldSession.status === 'completed' ? 'SUCCEEDED' : 'FAILED',
          rowsProcessed: oldSession.rowCount,
        },
      });

      console.log(`  ✅ Migrated session: ${oldSession.fileName} (${fileKind})`);
    }
    console.log(`✅ Migrated ${oldSessions.length} upload sessions\n`);

    // Step 4: Migrate ArnoldInventory → InventoryItem
    console.log('📝 Step 4: Migrating Arnold inventory to inventory items...');
    const oldArnoldItems = await oldDb.arnoldInventory.findMany();
    const arnoldItemMap = new Map<string, string>(); // old ID → new ID

    for (const oldItem of oldArnoldItems) {
      const newFileId = sessionMap.get(oldItem.sessionId);
      if (!newFileId) {
        console.warn(`  ⚠️  Skipping Arnold item ${oldItem.id}: session not found`);
        continue;
      }

      const newFile = await newDb.file.findUnique({ where: { id: newFileId } });
      if (!newFile) continue;

      // Normalize part number
      const partNumberNorm = normalizePartNumber(oldItem.partNumber);
      const { lineCode, partNumber } = extractLineCode(oldItem.partNumber);

      try {
        const newItem = await newDb.inventoryItem.create({
          data: {
            projectId: newFile.projectId,
            partNumber: oldItem.partNumber,
            cost: oldItem.cost,
            totalLastUsage: oldItem.usageLast12,
            partNumberNorm,
            lineCode,
            rawData: oldItem.rawData,
            createdAt: oldItem.createdAt,
          },
        });
        arnoldItemMap.set(oldItem.id, newItem.id);
      } catch (error) {
        // Duplicate key - item already exists
        console.warn(`  ⚠️  Skipping duplicate Arnold item: ${oldItem.partNumber}`);
      }
    }
    console.log(`✅ Migrated ${arnoldItemMap.size} Arnold inventory items\n`);

    // Step 5: Migrate SupplierCatalog → SupplierItem
    console.log('📝 Step 5: Migrating supplier catalog to supplier items...');
    const oldSupplierItems = await oldDb.supplierCatalog.findMany();
    const supplierItemMap = new Map<string, string>(); // old ID → new ID

    for (const oldItem of oldSupplierItems) {
      const newFileId = sessionMap.get(oldItem.sessionId);
      if (!newFileId) {
        console.warn(`  ⚠️  Skipping supplier item ${oldItem.id}: session not found`);
        continue;
      }

      const newFile = await newDb.file.findUnique({ where: { id: newFileId } });
      if (!newFile) continue;

      // Normalize part number
      const partNumberNorm = normalizePartNumber(oldItem.partNumber);

      const newItem = await newDb.supplierItem.create({
        data: {
          projectId: newFile.projectId,
          supplier: oldItem.supplierName,
          partNumber: oldItem.partNumber,
          partFull: oldItem.partFull,
          description: oldItem.description,
          currentCost: oldItem.cost,
          quantity: oldItem.qtyAvail,
          ytdHist: oldItem.ytdHist,
          partNumberNorm,
          lineCode: oldItem.lineCode,
          rawData: oldItem.rawData,
          createdAt: oldItem.createdAt,
        },
      });
      supplierItemMap.set(oldItem.id, newItem.id);
    }
    console.log(`✅ Migrated ${supplierItemMap.size} supplier catalog items\n`);

    // Step 6: Migrate KnownInterchange → Interchange
    console.log('📝 Step 6: Migrating known interchanges...');
    const oldInterchanges = await oldDb.knownInterchange.findMany();

    for (const oldInterchange of oldInterchanges) {
      // Find which project this belongs to (heuristic: first project)
      const firstProject = oldProjects[0];
      if (!firstProject) continue;
      const newProjectId = projectMap.get(firstProject.id);
      if (!newProjectId) continue;

      try {
        await newDb.interchange.create({
          data: {
            projectId: newProjectId,
            oursPartNumber: oldInterchange.arnoldSku,
            theirsPartNumber: oldInterchange.supplierSku,
            source: oldInterchange.source,
            confidence: oldInterchange.confidence,
            createdAt: oldInterchange.createdAt,
          },
        });
      } catch (error) {
        // Duplicate - skip
        console.warn(`  ⚠️  Skipping duplicate interchange: ${oldInterchange.arnoldSku} → ${oldInterchange.supplierSku}`);
      }
    }
    console.log(`✅ Migrated ${oldInterchanges.length} known interchanges\n`);

    // Step 7: Migrate MatchResult → MatchCandidate
    console.log('📝 Step 7: Migrating match results to match candidates...');
    const oldMatchResults = await oldDb.matchResult.findMany({
      include: {
        arnoldItem: true,
        supplierItem: true,
      },
    });

    let migratedMatches = 0;
    for (const oldMatch of oldMatchResults) {
      const newArnoldId = arnoldItemMap.get(oldMatch.arnoldItemId);
      if (!newArnoldId) {
        console.warn(`  ⚠️  Skipping match ${oldMatch.id}: Arnold item not found`);
        continue;
      }

      // Get the inventory item to find project ID
      const inventoryItem = await newDb.inventoryItem.findUnique({
        where: { id: newArnoldId },
      });
      if (!inventoryItem) continue;

      // For now, we'll create StoreItem from Arnold data (since old schema didn't separate them)
      // In reality, you'd need to identify which items are store items
      const storeItem = await newDb.storeItem.create({
        data: {
          projectId: inventoryItem.projectId,
          partNumber: oldMatch.arnoldItem.partNumber,
          currentCost: oldMatch.arnoldItem.cost,
          partNumberNorm: normalizePartNumber(oldMatch.arnoldItem.partNumber),
          lineCode: extractLineCode(oldMatch.arnoldItem.partNumber).lineCode,
          rawData: oldMatch.arnoldItem.rawData,
        },
      });

      // Determine target type and ID
      let targetType: 'INVENTORY' | 'SUPPLIER' = 'INVENTORY';
      let targetId = newArnoldId;

      if (oldMatch.supplierItemId) {
        const newSupplierId = supplierItemMap.get(oldMatch.supplierItemId);
        if (newSupplierId) {
          targetType = 'SUPPLIER';
          targetId = newSupplierId;
        }
      }

      // Map old match stage to new method
      let method: 'INTERCHANGE' | 'EXACT_NORM' | 'LINE_PN' | 'DESC_SIM' | 'FUZZY_SUBSTRING' | 'AI' = 'EXACT_NORM';
      if (oldMatch.matchStage === 'part_number') method = 'EXACT_NORM';
      else if (oldMatch.matchStage === 'part_name') method = 'LINE_PN';
      else if (oldMatch.matchStage === 'description') method = 'DESC_SIM';
      else if (oldMatch.matchStage === 'web_search') method = 'AI';

      // Map old status to new status
      let status: 'PENDING' | 'CONFIRMED' | 'REJECTED' = 'PENDING';
      if (oldMatch.status === 'confirmed') status = 'CONFIRMED';
      else if (oldMatch.status === 'rejected') status = 'REJECTED';

      await newDb.matchCandidate.create({
        data: {
          projectId: inventoryItem.projectId,
          storeItemId: storeItem.id,
          targetType,
          targetId,
          method,
          confidence: oldMatch.confidenceScore,
          features: oldMatch.matchReasons,
          status,
          decidedById: status !== 'PENDING' ? adminUser.id : null,
          decidedAt: oldMatch.confirmedAt,
          note: oldMatch.notes,
          createdAt: oldMatch.createdAt,
          updatedAt: oldMatch.updatedAt,
        },
      });

      migratedMatches++;
    }
    console.log(`✅ Migrated ${migratedMatches} match results\n`);

    // Step 8: Create audit log entries for migration
    console.log('📝 Step 8: Creating audit log entries...');
    for (const [oldProjectId, newProjectId] of projectMap.entries()) {
      await newDb.auditLog.create({
        data: {
          userId: adminUser.id,
          projectId: newProjectId,
          entity: 'Project',
          entityId: newProjectId,
          action: 'MIGRATION',
          meta: {
            oldProjectId,
            migratedAt: new Date().toISOString(),
            script: 'migrate-to-new-schema.ts',
          },
        },
      });
    }
    console.log(`✅ Created audit log entries\n`);

    console.log('🎉 Migration completed successfully!\n');
    console.log('📊 Summary:');
    console.log(`  - Projects: ${oldProjects.length}`);
    console.log(`  - Files: ${oldSessions.length}`);
    console.log(`  - Inventory Items: ${arnoldItemMap.size}`);
    console.log(`  - Supplier Items: ${supplierItemMap.size}`);
    console.log(`  - Interchanges: ${oldInterchanges.length}`);
    console.log(`  - Match Candidates: ${migratedMatches}`);
    console.log('\n⚠️  IMPORTANT: Change the default admin password!');
    console.log('   Email: admin@arnoldmotorsupply.com');
    console.log('   Password: admin123\n');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await oldDb.$disconnect();
    await newDb.$disconnect();
  }
}

// Helper functions
function normalizePartNumber(pn: string): string {
  if (!pn) return '';
  
  // Remove common prefixes
  const prefixes = ['XBO', 'RDS', 'LUB', 'AXL', 'AUV', 'RDSNC', 'RDSNCV'];
  let normalized = pn.toUpperCase().trim();
  
  for (const prefix of prefixes) {
    if (normalized.startsWith(prefix)) {
      normalized = normalized.substring(prefix.length);
      break;
    }
  }
  
  // Remove spaces, hyphens
  normalized = normalized.replace(/[\s\-]/g, '');
  
  return normalized;
}

function extractLineCode(pn: string): { lineCode: string | null; partNumber: string } {
  if (!pn) return { lineCode: null, partNumber: '' };
  
  const normalized = pn.toUpperCase().trim();
  
  // Check for line code pattern (e.g., AXL-1234, ABC10026A)
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
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
