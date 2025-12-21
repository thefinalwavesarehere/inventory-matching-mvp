/**
 * Interchange Resolver Service
 * 
 * Epic A4: Dual Interchange Support
 * 
 * Implements deterministic interchange lookup that runs BEFORE fuzzy/AI matching.
 * If a direct interchange exists, we use it and skip expensive AI steps.
 * 
 * Logic:
 * 1. Line Code Translation: Check if store's line code maps to a different target line code
 * 2. Direct Part Match: Check if exact part number interchange exists
 * 3. Return interchange match with 100% confidence, or null if no match
 */

import { prisma } from '@/app/lib/db/prisma';


/**
 * Interchange match result
 */
export interface InterchangeMatch {
  supplierItemId: string;
  supplierPartNumber: string;
  supplierLineCode: string;
  confidence: number; // Always 100 for interchange matches
  method: 'INTERCHANGE';
  translatedLineCode?: string; // If line code was translated
}

/**
 * Store part data for interchange lookup
 */
export interface StorePartData {
  partNumber: string;
  lineCode: string | null;
}

/**
 * Resolve interchange for a single store part
 * 
 * @param projectId Project ID
 * @param storePart Store part data (part number and line code)
 * @returns Interchange match or null if no match found
 */
export async function resolveInterchange(
  projectId: string,
  storePart: StorePartData
): Promise<InterchangeMatch | null> {
  try {
    // Step 1: Line Code Translation
    let effectiveLineCode = storePart.lineCode;
    let translatedLineCode: string | undefined;

    if (storePart.lineCode) {
      // Check for line code interchange (project-specific first, then global)
      const lineCodeInterchange = await prisma.lineCodeInterchange.findFirst({
        where: {
          sourceLineCode: storePart.lineCode,
          active: true,
          OR: [
            { projectId }, // Project-specific
            { projectId: null }, // Global
          ],
        },
        orderBy: [
          { priority: 'desc' }, // Higher priority first
          { projectId: 'desc' }, // Project-specific over global
        ],
      });

      if (lineCodeInterchange) {
        effectiveLineCode = lineCodeInterchange.targetLineCode;
        translatedLineCode = lineCodeInterchange.targetLineCode;
        console.log(
          `[INTERCHANGE] Line code translated: ${storePart.lineCode} → ${effectiveLineCode}`
        );
      }
    }

    // Step 2: Direct Part Number Match
    if (effectiveLineCode) {
      const partInterchange = await prisma.partNumberInterchange.findFirst({
        where: {
          projectId,
          sourceSupplierLineCode: effectiveLineCode,
          sourcePartNumber: storePart.partNumber,
          active: true,
        },
        orderBy: {
          priority: 'desc', // Higher priority first
        },
      });

      if (partInterchange) {
        // Find the supplier item
        const supplierItem = await prisma.supplierItem.findFirst({
          where: {
            partNumber: partInterchange.targetPartNumber,
            lineCode: partInterchange.targetSupplierLineCode,
          },
        });

        if (supplierItem) {
          console.log(
            `[INTERCHANGE] Part match found: ${storePart.partNumber} (${effectiveLineCode}) → ${partInterchange.targetPartNumber} (${partInterchange.targetSupplierLineCode})`
          );

          return {
            supplierItemId: supplierItem.id,
            supplierPartNumber: supplierItem.partNumber,
            supplierLineCode: supplierItem.lineCode || partInterchange.targetSupplierLineCode,
            confidence: 100, // Interchange matches are 100% confident
            method: 'INTERCHANGE',
            translatedLineCode,
          };
        }
      }
    }

    // No interchange match found
    return null;

  } catch (error) {
    console.error('[INTERCHANGE_RESOLVER] Error:', error);
    return null; // On error, return null and let fuzzy/AI matching handle it
  }
}

/**
 * Batch resolve interchanges for multiple store parts
 * 
 * Optimized with batch queries to reduce database calls
 * 
 * @param projectId Project ID
 * @param storeParts Array of store part data
 * @returns Array of interchange matches (null for no match)
 */
export async function resolveInterchangesBatch(
  projectId: string,
  storeParts: StorePartData[]
): Promise<(InterchangeMatch | null)[]> {
  try {
    // Extract unique line codes
    const lineCodes = [...new Set(
      storeParts.map(p => p.lineCode).filter(Boolean) as string[]
    )];

    // Batch fetch line code interchanges
    const lineCodeInterchanges = await prisma.lineCodeInterchange.findMany({
      where: {
        sourceLineCode: { in: lineCodes },
        active: true,
        OR: [
          { projectId },
          { projectId: null },
        ],
      },
      orderBy: [
        { priority: 'desc' },
        { projectId: 'desc' },
      ],
    });

    // Build line code translation map
    const lineCodeMap = new Map<string, string>();
    for (const interchange of lineCodeInterchanges) {
      if (!lineCodeMap.has(interchange.sourceLineCode)) {
        lineCodeMap.set(interchange.sourceLineCode, interchange.targetLineCode);
      }
    }

    // Translate line codes
    const translatedParts = storeParts.map(part => ({
      ...part,
      effectiveLineCode: part.lineCode && lineCodeMap.has(part.lineCode)
        ? lineCodeMap.get(part.lineCode)!
        : part.lineCode,
      translatedLineCode: part.lineCode && lineCodeMap.has(part.lineCode)
        ? lineCodeMap.get(part.lineCode)
        : undefined,
    }));

    // Build lookup keys for part number interchange
    const lookupKeys = translatedParts
      .filter(p => p.effectiveLineCode)
      .map(p => ({
        lineCode: p.effectiveLineCode!,
        partNumber: p.partNumber,
      }));

    // Batch fetch part number interchanges
    const partInterchanges = await prisma.partNumberInterchange.findMany({
      where: {
        projectId,
        active: true,
        OR: lookupKeys.map(key => ({
          sourceSupplierLineCode: key.lineCode,
          sourcePartNumber: key.partNumber,
        })),
      },
      orderBy: {
        priority: 'desc',
      },
    });

    // Build part interchange map
    const partInterchangeMap = new Map<string, typeof partInterchanges[0]>();
    for (const interchange of partInterchanges) {
      const key = `${interchange.sourceSupplierLineCode}:${interchange.sourcePartNumber}`;
      if (!partInterchangeMap.has(key)) {
        partInterchangeMap.set(key, interchange);
      }
    }

    // Get all target part numbers to fetch supplier items
    const targetPartNumbers = Array.from(partInterchangeMap.values()).map(
      i => ({ partNumber: i.targetPartNumber, lineCode: i.targetSupplierLineCode })
    );

    // Batch fetch supplier items
    const supplierItems = await prisma.supplierItem.findMany({
      where: {
        OR: targetPartNumbers.map(t => ({
          partNumber: t.partNumber,
          lineCode: t.lineCode,
        })),
      },
    });

    // Build supplier item map
    const supplierItemMap = new Map<string, typeof supplierItems[0]>();
    for (const item of supplierItems) {
      const key = `${item.lineCode}:${item.partNumber}`;
      supplierItemMap.set(key, item);
    }

    // Resolve matches for each store part
    const results = translatedParts.map(part => {
      if (!part.effectiveLineCode) return null;

      const lookupKey = `${part.effectiveLineCode}:${part.partNumber}`;
      const interchange = partInterchangeMap.get(lookupKey);

      if (!interchange) return null;

      const supplierKey = `${interchange.targetSupplierLineCode}:${interchange.targetPartNumber}`;
      const supplierItem = supplierItemMap.get(supplierKey);

      if (!supplierItem) return null;

      return {
        supplierItemId: supplierItem.id,
        supplierPartNumber: supplierItem.partNumber,
        supplierLineCode: supplierItem.lineCode || interchange.targetSupplierLineCode,
        confidence: 100,
        method: 'INTERCHANGE' as const,
        translatedLineCode: part.translatedLineCode,
      };
    });

    const matchCount = results.filter(r => r !== null).length;
    console.log(
      `[INTERCHANGE_BATCH] Resolved ${matchCount}/${storeParts.length} matches via interchange`
    );

    return results;

  } catch (error) {
    console.error('[INTERCHANGE_BATCH] Error:', error);
    // On error, return all nulls and let fuzzy/AI matching handle it
    return storeParts.map(() => null);
  }
}
