/**
 * P3: Line Code Preprocessing Service
 *
 * Normalizes client-provided line codes to manufacturer line codes
 * using project-specific and global mappings.
 *
 * Example: Client uses "GS" but manufacturer uses "GSP"
 *
 * Uses:
 * - ProjectLineCodeMapping for project-specific mappings
 * - LineCodeMapping for global mappings
 */

import { prisma } from './db/prisma';

export interface PreprocessResult {
  originalLineCode: string;
  normalizedLineCode: string;
  manufacturerLineCode: string | null;
  mappingFound: boolean;
  mappingSource: 'project' | 'global' | null;
}

/**
 * Preprocess a single line code using project and global mappings
 */
export async function preprocessLineCode(
  lineCode: string,
  projectId: string,
  manufacturerName?: string
): Promise<PreprocessResult> {
  const originalLineCode = lineCode;
  const normalizedLineCode = lineCode.trim().toUpperCase();

  // Try project-specific mapping first
  const projectMapping = await prisma.projectLineCodeMapping.findFirst({
    where: {
      projectId,
      sourceLineCode: normalizedLineCode,
      ...(manufacturerName ? { mappedManufacturer: manufacturerName } : {}),
    },
  });

  if (projectMapping && projectMapping.mappedArnoldLineCode) {
    return {
      originalLineCode,
      normalizedLineCode,
      manufacturerLineCode: projectMapping.mappedArnoldLineCode,
      mappingFound: true,
      mappingSource: 'project',
    };
  }

  // Try global mapping
  const globalMapping = await prisma.lineCodeMapping.findFirst({
    where: {
      clientLineCode: normalizedLineCode,
      ...(manufacturerName ? { manufacturerName } : {}),
    },
  });

  if (globalMapping && globalMapping.arnoldLineCode) {
    return {
      originalLineCode,
      normalizedLineCode,
      manufacturerLineCode: globalMapping.arnoldLineCode,
      mappingFound: true,
      mappingSource: 'global',
    };
  }

  // No mapping found
  return {
    originalLineCode,
    normalizedLineCode,
    manufacturerLineCode: null,
    mappingFound: false,
    mappingSource: null,
  };
}

/**
 * Batch preprocessing for multiple line codes
 * More efficient than calling preprocessLineCode repeatedly
 */
export async function preprocessLineCodeBatch(
  items: Array<{ lineCode: string; manufacturerName?: string }>,
  projectId: string
): Promise<Map<string, PreprocessResult>> {
  const results = new Map<string, PreprocessResult>();

  // Normalize all line codes
  const normalizedItems = items.map(item => ({
    ...item,
    normalizedLineCode: item.lineCode.trim().toUpperCase(),
  }));

  const uniqueLineCodes = [...new Set(normalizedItems.map(i => i.normalizedLineCode))];

  // Fetch all project mappings in one query
  const projectMappings = await prisma.projectLineCodeMapping.findMany({
    where: {
      projectId,
      sourceLineCode: { in: uniqueLineCodes },
    },
  });

  // Fetch all global mappings in one query
  const globalMappings = await prisma.lineCodeMapping.findMany({
    where: {
      clientLineCode: { in: uniqueLineCodes },
    },
  });

  // Build lookup maps
  const projectMap = new Map(
    projectMappings.map(m => [
      `${m.sourceLineCode}|${m.mappedManufacturer || ''}`,
      m
    ])
  );

  const globalMap = new Map(
    globalMappings.map(m => [
      `${m.clientLineCode}|${m.manufacturerName || ''}`,
      m
    ])
  );

  // Process each item
  for (const item of normalizedItems) {
    const key = `${item.lineCode}|${item.manufacturerName || ''}`;

    if (results.has(key)) {
      continue; // Already processed
    }

    const projectMapping = projectMap.get(`${item.normalizedLineCode}|${item.manufacturerName || ''}`);

    if (projectMapping && projectMapping.mappedArnoldLineCode) {
      results.set(key, {
        originalLineCode: item.lineCode,
        normalizedLineCode: item.normalizedLineCode,
        manufacturerLineCode: projectMapping.mappedArnoldLineCode,
        mappingFound: true,
        mappingSource: 'project',
      });
      continue;
    }

    const globalMapping = globalMap.get(`${item.normalizedLineCode}|${item.manufacturerName || ''}`);

    if (globalMapping && globalMapping.arnoldLineCode) {
      results.set(key, {
        originalLineCode: item.lineCode,
        normalizedLineCode: item.normalizedLineCode,
        manufacturerLineCode: globalMapping.arnoldLineCode,
        mappingFound: true,
        mappingSource: 'global',
      });
      continue;
    }

    // No mapping found
    results.set(key, {
      originalLineCode: item.lineCode,
      normalizedLineCode: item.normalizedLineCode,
      manufacturerLineCode: null,
      mappingFound: false,
      mappingSource: null,
    });
  }

  return results;
}

/**
 * Apply line code preprocessing to all store items in a project
 * Updates the manufacturerLineCode field based on mappings
 */
export async function applyLineCodePreprocessing(projectId: string): Promise<{
  totalItems: number;
  itemsMapped: number;
  mappingsApplied: number;
}> {
  console.log(`[LINE-CODE-PREPROCESSOR] Starting preprocessing for project ${projectId}`);

  // Fetch all store items for this project
  const storeItems = await prisma.storeItem.findMany({
    where: { projectId },
    select: {
      id: true,
      lineCode: true,
      manufacturerName: true,
    },
  });

  console.log(`[LINE-CODE-PREPROCESSOR] Found ${storeItems.length} store items`);

  if (storeItems.length === 0) {
    return {
      totalItems: 0,
      itemsMapped: 0,
      mappingsApplied: 0,
    };
  }

  // Batch preprocess
  const batchItems = storeItems
    .filter(item => item.lineCode)
    .map(item => ({
      lineCode: item.lineCode!,
      manufacturerName: item.manufacturerName || undefined,
    }));

  const results = await preprocessLineCodeBatch(batchItems, projectId);

  // Update store items in batches
  let mappingsApplied = 0;
  const updateBatchSize = 100;

  for (let i = 0; i < storeItems.length; i += updateBatchSize) {
    const batch = storeItems.slice(i, i + updateBatchSize);

    await prisma.$transaction(
      batch.map(item => {
        if (!item.lineCode) return prisma.storeItem.update({ where: { id: item.id }, data: {} });

        const key = `${item.lineCode}|${item.manufacturerName || ''}`;
        const result = results.get(key);

        if (result?.mappingFound && result.manufacturerLineCode) {
          mappingsApplied++;
          return prisma.storeItem.update({
            where: { id: item.id },
            data: {
              manufacturerLineCode: result.manufacturerLineCode,
              lineCodePreprocessed: true,
            },
          });
        }

        return prisma.storeItem.update({
          where: { id: item.id },
          data: {
            lineCodePreprocessed: true,
          },
        });
      })
    );
  }

  const itemsMapped = storeItems.filter(item => {
    if (!item.lineCode) return false;
    const key = `${item.lineCode}|${item.manufacturerName || ''}`;
    const result = results.get(key);
    return result?.mappingFound;
  }).length;

  console.log(`[LINE-CODE-PREPROCESSOR] Completed: ${itemsMapped}/${storeItems.length} items mapped, ${mappingsApplied} mappings applied`);

  return {
    totalItems: storeItems.length,
    itemsMapped,
    mappingsApplied,
  };
}
