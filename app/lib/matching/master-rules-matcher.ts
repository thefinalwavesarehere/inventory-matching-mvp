/**
 * Master Rules Matcher - Stage 0
 * 
 * Applies learned master rules from manual review decisions.
 * This runs BEFORE all other matching stages to ensure highest precedence.
 * 
 * Rule Types:
 * - POSITIVE_MAP: "Always match these two part numbers" → Creates CONFIRMED matches
 * - NEGATIVE_BLOCK: "Never match these two part numbers" → Prevents future matches
 */

import { prisma } from '@/app/lib/db/prisma';
import { MatchMethod, MatchStatus } from '@prisma/client';

/**
 * Apply master rules to a project
 * 
 * @param projectId - Project ID
 * @returns Number of matches created
 */
export async function applyMasterRules(projectId: string): Promise<number> {
  console.log('[MASTER-RULES-MATCHER] ========== STAGE 0: MASTER RULES ==========');
  console.log(`[MASTER-RULES-MATCHER] Applying learned rules to project ${projectId}`);
  
  // Fetch all enabled master rules (global + project-specific)
  const rules = await prisma.masterRule.findMany({
    where: {
      enabled: true,
      OR: [
        { scope: 'GLOBAL' },
        { scope: 'PROJECT_SPECIFIC', projectId }
      ]
    }
  });
  
  console.log(`[MASTER-RULES-MATCHER] Found ${rules.length} enabled rules`);
  
  if (rules.length === 0) {
    console.log('[MASTER-RULES-MATCHER] No rules to apply');
    return 0;
  }
  
  // Separate positive and negative rules
  const positiveRules = rules.filter(r => r.ruleType === 'POSITIVE_MAP');
  const negativeRules = rules.filter(r => r.ruleType === 'NEGATIVE_BLOCK');
  
  console.log(`[MASTER-RULES-MATCHER] ${positiveRules.length} POSITIVE_MAP rules, ${negativeRules.length} NEGATIVE_BLOCK rules`);
  
  let matchesCreated = 0;
  let matchesBlocked = 0;
  
  // Apply POSITIVE_MAP rules (create matches)
  for (const rule of positiveRules) {
    try {
      // Find store items matching the rule
      const storeItems = await prisma.storeItem.findMany({
        where: {
          projectId,
          partNumber: rule.storePartNumber,
        }
      });
      
      if (storeItems.length === 0) {
        continue; // No matching store items in this project
      }
      
      // Find supplier items matching the rule
      const supplierItems = await prisma.supplierItem.findMany({
        where: {
          projectId,
          partNumber: rule.supplierPartNumber!,
        }
      });
      
      if (supplierItems.length === 0) {
        continue; // No matching supplier items in this project
      }
      
      // Create matches for all combinations
      for (const storeItem of storeItems) {
        for (const supplierItem of supplierItems) {
          // Check if match already exists at any stage
          const existingMatch = await prisma.matchCandidate.findFirst({
            where: {
              projectId,
              storeItemId: storeItem.id,
              targetId: supplierItem.id,
              targetType: 'SUPPLIER',
            }
          });
          
          if (existingMatch) {
            console.log(`[MASTER-RULES-MATCHER] Match already exists for ${storeItem.partNumber} → ${supplierItem.partNumber}`);
            continue;
          }
          
          // Create new match with CONFIRMED status (auto-approve master rules)
          await prisma.matchCandidate.create({
            data: {
              projectId,
              storeItemId: storeItem.id,
              targetType: 'SUPPLIER',
              targetId: supplierItem.id,
              method: MatchMethod.MASTER_RULE,
              confidence: rule.confidence,
              matchStage: 0, // Stage 0 = Master Rules
              status: MatchStatus.CONFIRMED, // Auto-confirm learned rules
              features: {
                ruleId: rule.id,
                ruleType: rule.ruleType,
                learnedFrom: rule.projectId,
                autoConfirmed: true,
              }
            }
          });
          
          matchesCreated++;
          
          // Update rule usage statistics
          await prisma.masterRule.update({
            where: { id: rule.id },
            data: {
              appliedCount: { increment: 1 },
              lastAppliedAt: new Date(),
            }
          });
          
          console.log(`[MASTER-RULES-MATCHER] ✅ Created match: ${storeItem.partNumber} → ${supplierItem.partNumber} (Rule: ${rule.id})`);
        }
      }
    } catch (error) {
      console.error(`[MASTER-RULES-MATCHER] Error applying rule ${rule.id}:`, error);
    }
  }
  
  // Apply NEGATIVE_BLOCK rules (prevent matches)
  for (const rule of negativeRules) {
    try {
       // Delete any existing matches that violate this rule
      // First, find the supplier item ID
      const supplierItem = await prisma.supplierItem.findFirst({
        where: {
          projectId,
          partNumber: rule.supplierPartNumber!
        },
        select: { id: true }
      });
      
      if (!supplierItem) {
        console.log(`[MASTER-RULES-MATCHER] ⚠️ Supplier item not found for NEGATIVE_BLOCK: ${rule.supplierPartNumber}`);
        continue;
      }
      
      const deleted = await prisma.matchCandidate.deleteMany({
        where: {
          projectId,
          storeItem: {
            partNumber: rule.storePartNumber
          },
          targetType: 'SUPPLIER',
          targetId: supplierItem.id
        }
      });
      
      if (deleted.count > 0) {
        matchesBlocked += deleted.count;
        console.log(`[MASTER-RULES-MATCHER] 🚫 Blocked ${deleted.count} matches: ${rule.storePartNumber} ↛ ${rule.supplierPartNumber}`);
        
        // Update rule usage statistics
        await prisma.masterRule.update({
          where: { id: rule.id },
          data: {
            appliedCount: { increment: deleted.count },
            lastAppliedAt: new Date(),
          }
        });
      }
    } catch (error) {
      console.error(`[MASTER-RULES-MATCHER] Error applying block rule ${rule.id}:`, error);
    }
  }
  
  console.log(`[MASTER-RULES-MATCHER] ========== STAGE 0 COMPLETE ==========`);
  console.log(`[MASTER-RULES-MATCHER] Created: ${matchesCreated} matches`);
  console.log(`[MASTER-RULES-MATCHER] Blocked: ${matchesBlocked} matches`);
  
  return matchesCreated;
}
