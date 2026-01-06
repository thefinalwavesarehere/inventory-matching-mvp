/**
 * Prompt 2: Manufacturer Part Extraction
 * 
 * Safely extracts Arnold line code + manufacturer part from full SKU
 * WITHOUT altering the canonical partNumberNorm used by V4 exact matching.
 * 
 * This is a DERIVED field for fuzzy/AI hints only.
 */

import prisma from '@/app/lib/db/prisma';

/**
 * Canonical normalization (same as V4)
 */
function canonicalNormalize(part: string): string {
  return String(part).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Extract Arnold line code + manufacturer part (project-config gated)
 * 
 * @param fullSkuRaw - Raw full SKU (e.g., "MEV-ES409LT")
 * @param enableSplit - Project config toggle
 * @returns { arnoldLineCodeRaw, manufacturerPartRaw, manufacturerPartNorm }
 */
export function extractManufacturerPart(
  fullSkuRaw: string | null | undefined,
  enableSplit: boolean
): {
  arnoldLineCodeRaw: string | null;
  manufacturerPartRaw: string | null;
  manufacturerPartNorm: string | null;
} {
  if (!fullSkuRaw || !enableSplit) {
    return {
      arnoldLineCodeRaw: null,
      manufacturerPartRaw: null,
      manufacturerPartNorm: null,
    };
  }

  const raw = String(fullSkuRaw).trim();
  
  // Only split if length >= 4 (3-char line code + at least 1 char mfr part)
  if (raw.length < 4) {
    return {
      arnoldLineCodeRaw: null,
      manufacturerPartRaw: null,
      manufacturerPartNorm: null,
    };
  }

  const arnoldLineCodeRaw = raw.slice(0, 3).toUpperCase();
  const manufacturerPartRaw = raw.slice(3);
  const manufacturerPartNorm = canonicalNormalize(manufacturerPartRaw);

  return {
    arnoldLineCodeRaw,
    manufacturerPartRaw,
    manufacturerPartNorm,
  };
}

/**
 * Backfill manufacturer part fields for existing store items
 * 
 * @param projectId - Project to backfill
 */
export async function backfillManufacturerParts(projectId: string): Promise<number> {
  console.log(`[PROMPT2-BACKFILL] Starting manufacturer part backfill for project ${projectId}`);

  // Get project config
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { enableArnoldLineCodeSplit: true },
  });

  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }

  if (!project.enableArnoldLineCodeSplit) {
    console.log(`[PROMPT2-BACKFILL] Arnold line code split disabled for project ${projectId} - skipping`);
    return 0;
  }

  // Get all store items
  const storeItems = await prisma.storeItem.findMany({
    where: { projectId },
    select: { id: true, partFull: true },
  });

  console.log(`[PROMPT2-BACKFILL] Found ${storeItems.length} store items to process`);

  let updatedCount = 0;

  // Update in batches
  for (const item of storeItems) {
    const extracted = extractManufacturerPart(item.partFull, true);

    if (extracted.manufacturerPartNorm) {
      await prisma.storeItem.update({
        where: { id: item.id },
        data: {
          arnoldLineCodeRaw: extracted.arnoldLineCodeRaw,
          manufacturerPartRaw: extracted.manufacturerPartRaw,
          manufacturerPartNorm: extracted.manufacturerPartNorm,
        },
      });
      updatedCount++;
    }
  }

  console.log(`[PROMPT2-BACKFILL] Updated ${updatedCount} store items with manufacturer part fields`);

  return updatedCount;
}
