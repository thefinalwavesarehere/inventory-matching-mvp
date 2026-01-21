/**
 * Interchange to Master Rules Converter
 * 
 * Converts interchange rules (Interchange, PartNumberInterchange, InterchangeMapping)
 * into MasterRule entries for use in the master rules matching stage.
 */

import { prisma } from '@/app/lib/db/prisma';
import { MasterRuleType, MasterRuleScope } from '@prisma/client';

export interface ConversionResult {
  created: number;
  skipped: number;
  errors: number;
  details: string[];
}

/**
 * Convert Interchange entries to MasterRules
 * 
 * Interchange table has:
 * - merrillPartNumber (our part) ↔ vendorPartNumber (their part)
 * - Used for matching store inventory to supplier catalog
 */
export async function convertInterchangeToMasterRules(
  projectId?: string,
  userId: string = 'system'
): Promise<ConversionResult> {
  const result: ConversionResult = {
    created: 0,
    skipped: 0,
    errors: 0,
    details: [],
  };

  console.log(`[INTERCHANGE-CONVERTER] Converting Interchange entries to MasterRules...`);

  try {
    // Fetch interchange entries
    const where = projectId ? { projectId } : {};
    const interchanges = await prisma.interchange.findMany({
      where,
      select: {
        id: true,
        projectId: true,
        merrillPartNumberNorm: true,
        vendorPartNumberNorm: true,
        vendor: true,
      },
    });

    console.log(`[INTERCHANGE-CONVERTER] Found ${interchanges.length} interchange entries`);

    for (const interchange of interchanges) {
      // Skip if missing normalized part numbers
      if (!interchange.merrillPartNumberNorm || !interchange.vendorPartNumberNorm) {
        result.skipped++;
        continue;
      }

      try {
        // Check if rule already exists
        const existingRule = await prisma.masterRule.findFirst({
          where: {
            storePartNumber: interchange.merrillPartNumberNorm,
            supplierPartNumber: interchange.vendorPartNumberNorm,
            ruleType: MasterRuleType.POSITIVE_MAP,
            enabled: true,
          },
        });

        if (existingRule) {
          result.skipped++;
          continue;
        }

        // Validate projectId
        let validatedProjectId: string | null = null;
        if (interchange.projectId) {
          const projectExists = await prisma.project.findUnique({
            where: { id: interchange.projectId },
            select: { id: true },
          });
          if (projectExists) {
            validatedProjectId = interchange.projectId;
          }
        }

        // Create master rule
        await prisma.masterRule.create({
          data: {
            ruleType: MasterRuleType.POSITIVE_MAP,
            scope: validatedProjectId ? MasterRuleScope.PROJECT : MasterRuleScope.GLOBAL,
            storePartNumber: interchange.merrillPartNumberNorm,
            supplierPartNumber: interchange.vendorPartNumberNorm,
            lineCode: interchange.vendor || null,
            confidence: 0.95, // High confidence from interchange data
            enabled: true,
            createdBy: userId,
            projectId: validatedProjectId,
            matchCandidateId: null,
          },
        });

        result.created++;
        result.details.push(
          `Created rule: ${interchange.merrillPartNumberNorm} → ${interchange.vendorPartNumberNorm} (${interchange.vendor || 'N/A'})`
        );
      } catch (error) {
        result.errors++;
        console.error(`[INTERCHANGE-CONVERTER] Error converting interchange ${interchange.id}:`, error);
      }
    }
  } catch (error) {
    console.error('[INTERCHANGE-CONVERTER] Fatal error:', error);
    throw error;
  }

  console.log(
    `[INTERCHANGE-CONVERTER] Conversion complete: ${result.created} created, ${result.skipped} skipped, ${result.errors} errors`
  );

  return result;
}

/**
 * Convert PartNumberInterchange entries to MasterRules
 * 
 * PartNumberInterchange has:
 * - sourcePartNumber + sourceSupplierLineCode → targetPartNumber + targetSupplierLineCode
 */
export async function convertPartNumberInterchangeToMasterRules(
  projectId?: string,
  userId: string = 'system'
): Promise<ConversionResult> {
  const result: ConversionResult = {
    created: 0,
    skipped: 0,
    errors: 0,
    details: [],
  };

  console.log(`[INTERCHANGE-CONVERTER] Converting PartNumberInterchange entries to MasterRules...`);

  try {
    const where = projectId ? { projectId, active: true } : { active: true };
    const interchanges = await prisma.partNumberInterchange.findMany({
      where,
      select: {
        id: true,
        projectId: true,
        sourcePartNumber: true,
        sourceSupplierLineCode: true,
        targetPartNumber: true,
        targetSupplierLineCode: true,
        priority: true,
      },
    });

    console.log(`[INTERCHANGE-CONVERTER] Found ${interchanges.length} part number interchange entries`);

    for (const interchange of interchanges) {
      try {
        // Check if rule already exists
        const existingRule = await prisma.masterRule.findFirst({
          where: {
            storePartNumber: interchange.sourcePartNumber,
            supplierPartNumber: interchange.targetPartNumber,
            lineCode: interchange.targetSupplierLineCode,
            ruleType: MasterRuleType.POSITIVE_MAP,
            enabled: true,
          },
        });

        if (existingRule) {
          result.skipped++;
          continue;
        }

        // Validate projectId
        let validatedProjectId: string | null = null;
        if (interchange.projectId) {
          const projectExists = await prisma.project.findUnique({
            where: { id: interchange.projectId },
            select: { id: true },
          });
          if (projectExists) {
            validatedProjectId = interchange.projectId;
          }
        }

        // Create master rule
        await prisma.masterRule.create({
          data: {
            ruleType: MasterRuleType.POSITIVE_MAP,
            scope: validatedProjectId ? MasterRuleScope.PROJECT : MasterRuleScope.GLOBAL,
            storePartNumber: interchange.sourcePartNumber,
            supplierPartNumber: interchange.targetPartNumber,
            lineCode: interchange.targetSupplierLineCode,
            confidence: 0.95,
            enabled: true,
            createdBy: userId,
            projectId: validatedProjectId,
            matchCandidateId: null,
          },
        });

        result.created++;
        result.details.push(
          `Created rule: ${interchange.sourcePartNumber} (${interchange.sourceSupplierLineCode}) → ${interchange.targetPartNumber} (${interchange.targetSupplierLineCode})`
        );
      } catch (error) {
        result.errors++;
        console.error(`[INTERCHANGE-CONVERTER] Error converting part number interchange ${interchange.id}:`, error);
      }
    }
  } catch (error) {
    console.error('[INTERCHANGE-CONVERTER] Fatal error:', error);
    throw error;
  }

  console.log(
    `[INTERCHANGE-CONVERTER] Conversion complete: ${result.created} created, ${result.skipped} skipped, ${result.errors} errors`
  );

  return result;
}

/**
 * Convert InterchangeMapping entries to MasterRules
 * 
 * InterchangeMapping has:
 * - competitorFullSku → arnoldFullSku
 * - competitorPartNumber + competitorLineCode → arnoldPartNumber + arnoldLineCode
 */
export async function convertInterchangeMappingToMasterRules(
  userId: string = 'system'
): Promise<ConversionResult> {
  const result: ConversionResult = {
    created: 0,
    skipped: 0,
    errors: 0,
    details: [],
  };

  console.log(`[INTERCHANGE-CONVERTER] Converting InterchangeMapping entries to MasterRules...`);

  try {
    const mappings = await prisma.interchangeMapping.findMany({
      where: { active: true },
      select: {
        id: true,
        competitorPartNumber: true,
        competitorLineCode: true,
        arnoldPartNumber: true,
        arnoldLineCode: true,
      },
    });

    console.log(`[INTERCHANGE-CONVERTER] Found ${mappings.length} interchange mapping entries`);

    for (const mapping of mappings) {
      // Skip if missing part numbers
      if (!mapping.competitorPartNumber || !mapping.arnoldPartNumber) {
        result.skipped++;
        continue;
      }

      try {
        // Check if rule already exists
        const existingRule = await prisma.masterRule.findFirst({
          where: {
            storePartNumber: mapping.competitorPartNumber,
            supplierPartNumber: mapping.arnoldPartNumber,
            lineCode: mapping.arnoldLineCode || undefined,
            ruleType: MasterRuleType.POSITIVE_MAP,
            enabled: true,
          },
        });

        if (existingRule) {
          result.skipped++;
          continue;
        }

        // Create master rule (global scope for interchange mappings)
        await prisma.masterRule.create({
          data: {
            ruleType: MasterRuleType.POSITIVE_MAP,
            scope: MasterRuleScope.GLOBAL,
            storePartNumber: mapping.competitorPartNumber,
            supplierPartNumber: mapping.arnoldPartNumber,
            lineCode: mapping.arnoldLineCode || null,
            confidence: 0.95,
            enabled: true,
            createdBy: userId,
            projectId: null,
            matchCandidateId: null,
          },
        });

        result.created++;
        result.details.push(
          `Created rule: ${mapping.competitorPartNumber} (${mapping.competitorLineCode || 'N/A'}) → ${mapping.arnoldPartNumber} (${mapping.arnoldLineCode || 'N/A'})`
        );
      } catch (error) {
        result.errors++;
        console.error(`[INTERCHANGE-CONVERTER] Error converting interchange mapping ${mapping.id}:`, error);
      }
    }
  } catch (error) {
    console.error('[INTERCHANGE-CONVERTER] Fatal error:', error);
    throw error;
  }

  console.log(
    `[INTERCHANGE-CONVERTER] Conversion complete: ${result.created} created, ${result.skipped} skipped, ${result.errors} errors`
  );

  return result;
}

/**
 * Convert all interchange types to master rules
 */
export async function convertAllInterchangesToMasterRules(
  projectId?: string,
  userId: string = 'system'
): Promise<ConversionResult> {
  console.log(`[INTERCHANGE-CONVERTER] Starting full interchange conversion...`);

  const results: ConversionResult[] = [];

  // Convert Interchange entries
  results.push(await convertInterchangeToMasterRules(projectId, userId));

  // Convert PartNumberInterchange entries
  results.push(await convertPartNumberInterchangeToMasterRules(projectId, userId));

  // Convert InterchangeMapping entries (global only)
  if (!projectId) {
    results.push(await convertInterchangeMappingToMasterRules(userId));
  }

  // Aggregate results
  const aggregated: ConversionResult = {
    created: results.reduce((sum, r) => sum + r.created, 0),
    skipped: results.reduce((sum, r) => sum + r.skipped, 0),
    errors: results.reduce((sum, r) => sum + r.errors, 0),
    details: results.flatMap((r) => r.details),
  };

  console.log(
    `[INTERCHANGE-CONVERTER] Full conversion complete: ${aggregated.created} created, ${aggregated.skipped} skipped, ${aggregated.errors} errors`
  );

  return aggregated;
}
