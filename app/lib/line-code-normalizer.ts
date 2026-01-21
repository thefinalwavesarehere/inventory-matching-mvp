/**
 * P3: Line Code Normalization Service
 * 
 * Applies line code mappings to normalize part numbers before matching.
 * Uses both global and project-specific mappings with project mappings taking precedence.
 */

import { prisma } from './db/prisma';

interface LineCodeMapping {
  clientLineCode: string;
  manufacturerName: string | null;
  arnoldLineCode: string | null;
}

interface NormalizedPartNumber {
  original: string;
  normalized: string;
  lineCode: string | null;
  partNumber: string | null;
  wasNormalized: boolean;
  mappingUsed: string | null; // 'project' | 'global' | null
}

/**
 * Load all applicable line code mappings for a project
 */
export async function loadLineCodeMappings(projectId: string): Promise<Map<string, LineCodeMapping>> {
  const mappingMap = new Map<string, LineCodeMapping>();

  // Load global mappings first
  const globalMappings = await prisma.lineCodeMapping.findMany({
    where: {},
    select: {
      clientLineCode: true,
      manufacturerName: true,
      arnoldLineCode: true,
    },
  });

  for (const mapping of globalMappings) {
    const key = mapping.clientLineCode.toUpperCase();
    mappingMap.set(key, {
      clientLineCode: mapping.clientLineCode,
      manufacturerName: mapping.manufacturerName,
      arnoldLineCode: mapping.arnoldLineCode,
    });
  }

  // Load project-specific mappings (these override global)
  const projectMappings = await prisma.projectLineCodeMapping.findMany({
    where: {
      projectId,
      status: { in: ['MANUAL', 'APPROVED'] }, // Only use approved mappings
    },
    select: {
      sourceLineCode: true,
      mappedManufacturer: true,
      mappedArnoldLineCode: true,
    },
  });

  for (const mapping of projectMappings) {
    const key = mapping.sourceLineCode.toUpperCase();
    mappingMap.set(key, {
      clientLineCode: mapping.sourceLineCode,
      manufacturerName: mapping.mappedManufacturer,
      arnoldLineCode: mapping.mappedArnoldLineCode,
    });
  }

  return mappingMap;
}

/**
 * Parse a part number into line code and part number components
 * Supports formats like: "AC-12345", "AC12345", "12345"
 */
export function parsePartNumber(partNumber: string): { lineCode: string | null; partNumber: string } {
  if (!partNumber) {
    return { lineCode: null, partNumber: '' };
  }

  const trimmed = partNumber.trim().toUpperCase();

  // Try to extract line code (2-3 letter prefix)
  const match = trimmed.match(/^([A-Z]{2,3})[-\s]?(.+)$/);
  
  if (match) {
    return {
      lineCode: match[1],
      partNumber: match[2],
    };
  }

  // No line code found
  return {
    lineCode: null,
    partNumber: trimmed,
  };
}

/**
 * Normalize a single part number using line code mappings
 */
export function normalizePartNumber(
  partNumber: string,
  mappings: Map<string, LineCodeMapping>
): NormalizedPartNumber {
  const { lineCode, partNumber: pn } = parsePartNumber(partNumber);

  if (!lineCode) {
    return {
      original: partNumber,
      normalized: partNumber,
      lineCode: null,
      partNumber: pn,
      wasNormalized: false,
      mappingUsed: null,
    };
  }

  // Check if we have a mapping for this line code
  const mapping = mappings.get(lineCode);

  if (!mapping || !mapping.arnoldLineCode) {
    return {
      original: partNumber,
      normalized: partNumber,
      lineCode,
      partNumber: pn,
      wasNormalized: false,
      mappingUsed: null,
    };
  }

  // Apply the mapping
  const normalizedLineCode = mapping.arnoldLineCode;
  const normalized = `${normalizedLineCode}-${pn}`;

  return {
    original: partNumber,
    normalized,
    lineCode: normalizedLineCode,
    partNumber: pn,
    wasNormalized: true,
    mappingUsed: mapping.clientLineCode === lineCode ? 'global' : 'project',
  };
}

/**
 * Normalize a batch of part numbers
 */
export function normalizeBatch(
  partNumbers: string[],
  mappings: Map<string, LineCodeMapping>
): NormalizedPartNumber[] {
  return partNumbers.map(pn => normalizePartNumber(pn, mappings));
}

/**
 * Apply line code normalization to inventory items in the database
 * This should be called after CSV import and before matching
 */
export async function normalizeInventoryItems(projectId: string): Promise<{
  totalItems: number;
  normalizedCount: number;
  skippedCount: number;
}> {
  const mappings = await loadLineCodeMappings(projectId);

  // Get all inventory items for this project
  const items = await prisma.inventoryItem.findMany({
    where: { projectId },
    select: {
      id: true,
      partNumber: true,
    },
  });

  let normalizedCount = 0;
  let skippedCount = 0;

  // Normalize each item
  for (const item of items) {
    const result = normalizePartNumber(item.partNumber, mappings);

    if (result.wasNormalized) {
      // Update the item with normalized part number
      await prisma.inventoryItem.update({
        where: { id: item.id },
        data: {
          partNumber: result.normalized,
          // Store original in description or custom field if needed
        },
      });
      normalizedCount++;
    } else {
      skippedCount++;
    }
  }

  return {
    totalItems: items.length,
    normalizedCount,
    skippedCount,
  };
}

/**
 * Apply line code normalization to supplier items in the database
 */
export async function normalizeSupplierItems(projectId: string): Promise<{
  totalItems: number;
  normalizedCount: number;
  skippedCount: number;
}> {
  const mappings = await loadLineCodeMappings(projectId);

  // Get all supplier items for this project
  const items = await prisma.supplierItem.findMany({
    where: { projectId },
    select: {
      id: true,
      partNumber: true,
    },
  });

  let normalizedCount = 0;
  let skippedCount = 0;

  // Normalize each item
  for (const item of items) {
    const result = normalizePartNumber(item.partNumber, mappings);

    if (result.wasNormalized) {
      // Update the item with normalized part number
      await prisma.supplierItem.update({
        where: { id: item.id },
        data: {
          partNumber: result.normalized,
        },
      });
      normalizedCount++;
    } else {
      skippedCount++;
    }
  }

  return {
    totalItems: items.length,
    normalizedCount,
    skippedCount,
  };
}
