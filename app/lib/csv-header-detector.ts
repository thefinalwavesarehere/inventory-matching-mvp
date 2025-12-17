/**
 * Epic A5: CSV Header Detection Service
 * 
 * Detects CSV headers and determines if user mapping is required
 */

import { FileTypeForMapping } from '@prisma/client';
import {
  resolveColumnMapping,
  validateRequiredColumns,
  REQUIRED_ROLES,
} from './column-mapping-resolver';

export interface HeaderDetectionResult {
  headers: string[];
  needsMapping: boolean;
  missingRoles: string[];
  resolvedMapping?: Map<string, string>;
}

/**
 * Detect headers from CSV content and check if mapping is needed
 * 
 * @param csvContent - Raw CSV file content
 * @param projectId - Project ID
 * @param fileType - Type of file being uploaded
 * @returns Detection result with headers and mapping status
 */
export async function detectHeadersAndMapping(
  csvContent: string,
  projectId: string,
  fileType: FileTypeForMapping
): Promise<HeaderDetectionResult> {
  // Parse first line to get headers
  const lines = csvContent.split('\n');
  if (lines.length === 0) {
    throw new Error('CSV file is empty');
  }

  const firstLine = lines[0].trim();
  const headers = parseCSVLine(firstLine);

  // Resolve column mapping (user mappings + defaults)
  const resolvedMapping = await resolveColumnMapping(projectId, fileType, headers);

  // Validate required columns
  const validation = validateRequiredColumns(fileType, resolvedMapping);

  return {
    headers,
    needsMapping: !validation.valid,
    missingRoles: validation.missing,
    resolvedMapping,
  };
}

/**
 * Parse a CSV line into an array of column names
 * Handles quoted fields with commas
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  // Push the last field
  if (current) {
    result.push(current.trim());
  }

  return result;
}

/**
 * Get human-readable field names for missing roles
 */
export function getMissingFieldNames(missingRoles: string[]): string[] {
  const roleToName: Record<string, string> = {
    part_number: 'Part Number',
    line_code: 'Line Code / Brand',
    description: 'Description',
    quantity: 'Quantity',
    cost: 'Cost',
    price: 'Price',
    location: 'Location',
    category: 'Category',
    subcategory: 'Subcategory',
    source_line_code: 'Source Line Code',
    target_line_code: 'Target Line Code',
    source_supplier_line_code: 'Source Supplier Line Code',
    source_part_number: 'Source Part Number',
    target_supplier_line_code: 'Target Supplier Line Code',
    target_part_number: 'Target Part Number',
    priority: 'Priority',
  };

  return missingRoles.map((role) => roleToName[role] || role);
}
