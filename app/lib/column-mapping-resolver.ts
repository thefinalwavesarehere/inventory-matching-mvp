/**
 * Epic A5: Column Mapping Resolver Service
 * 
 * Resolves CSV column headers to system semantic roles using:
 * 1. User-defined mappings (from database)
 * 2. Default column name patterns (fallback)
 */

import { FileTypeForMapping } from '@prisma/client';
import { prisma } from '@/app/lib/db/prisma';


/**
 * Default column name patterns for each semantic role
 * These are tried if no user mapping exists
 */
const DEFAULT_COLUMN_PATTERNS: Record<string, string[]> = {
  // Part number variations
  part_number: [
    'PartNumber',
    'Part Number',
    'Part #',
    'Part#',
    'PartNo',
    'Part_Number',
    'part_number',
    'partnumber',
    'PART_NUMBER',
    'Part',
  ],
  
  // Line code variations
  line_code: [
    'LineCode',
    'Line Code',
    'Line',
    'Brand',
    'Manufacturer',
    'line_code',
    'linecode',
    'LINE_CODE',
    'Mfg',
    'MFG',
  ],
  
  // Description variations
  description: [
    'Description',
    'Desc',
    'Product Description',
    'Item Description',
    'description',
    'DESCRIPTION',
    'Product',
  ],
  
  // Quantity variations
  quantity: [
    'Quantity',
    'Qty',
    'QtyOnHand',
    'Qty On Hand',
    'On Hand',
    'Stock',
    'quantity',
    'qty',
    'QUANTITY',
  ],
  
  // Cost variations
  cost: [
    'Cost',
    'Unit Cost',
    'UnitCost',
    'cost',
    'COST',
  ],
  
  // Price variations
  price: [
    'Price',
    'Unit Price',
    'UnitPrice',
    'SellPrice',
    'Sell Price',
    'price',
    'PRICE',
  ],
  
  // Location variations
  location: [
    'Location',
    'Bin',
    'Warehouse',
    'location',
    'LOCATION',
  ],
  
  // Category variations
  category: [
    'Category',
    'Cat',
    'Product Category',
    'category',
    'CATEGORY',
  ],
  
  // Subcategory variations
  subcategory: [
    'Subcategory',
    'Sub Category',
    'SubCat',
    'subcategory',
    'SUBCATEGORY',
  ],
  
  // Interchange-specific fields
  source_line_code: [
    'source_line_code',
    'Source Line Code',
    'SourceLineCode',
    'From Line Code',
  ],
  
  target_line_code: [
    'target_line_code',
    'Target Line Code',
    'TargetLineCode',
    'To Line Code',
  ],
  
  source_supplier_line_code: [
    'source_supplier_line_code',
    'Source Supplier Line Code',
    'SourceSupplierLineCode',
  ],
  
  source_part_number: [
    'source_part_number',
    'Source Part Number',
    'SourcePartNumber',
  ],
  
  target_supplier_line_code: [
    'target_supplier_line_code',
    'Target Supplier Line Code',
    'TargetSupplierLineCode',
  ],
  
  target_part_number: [
    'target_part_number',
    'Target Part Number',
    'TargetPartNumber',
  ],
  
  priority: [
    'priority',
    'Priority',
    'PRIORITY',
  ],
};

/**
 * Required semantic roles by file type
 */
export const REQUIRED_ROLES: Record<FileTypeForMapping, string[]> = {
  STORE_INVENTORY: ['part_number', 'line_code'],
  SUPPLIER_CATALOG: ['part_number', 'line_code'],
  LINE_CODE_INTERCHANGE: ['source_line_code', 'target_line_code'],
  PART_NUMBER_INTERCHANGE: [
    'source_supplier_line_code',
    'source_part_number',
    'target_supplier_line_code',
    'target_part_number',
  ],
};

/**
 * Optional semantic roles by file type
 */
export const OPTIONAL_ROLES: Record<FileTypeForMapping, string[]> = {
  STORE_INVENTORY: ['description', 'quantity', 'cost', 'location'],
  SUPPLIER_CATALOG: ['description', 'price', 'cost', 'category', 'subcategory'],
  LINE_CODE_INTERCHANGE: ['priority'],
  PART_NUMBER_INTERCHANGE: ['priority'],
};

/**
 * Resolve column headers to semantic roles
 * 
 * @param projectId - Project ID
 * @param fileType - Type of file being uploaded
 * @param headers - Array of column headers from the CSV file
 * @returns Mapping from semantic role to column name
 */
export async function resolveColumnMapping(
  projectId: string,
  fileType: FileTypeForMapping,
  headers: string[]
): Promise<Map<string, string>> {
  const mapping = new Map<string, string>();

  // Step 1: Fetch user-defined mappings from database
  const userMappings = await prisma.fileColumnMapping.findMany({
    where: {
      projectId,
      fileType,
    },
  });

  // Create a lookup map: semanticRole -> columnName
  const userMappingMap = new Map<string, string>();
  for (const m of userMappings) {
    userMappingMap.set(m.semanticRole, m.columnName);
  }

  // Step 2: Resolve required and optional roles
  const allRoles = [
    ...REQUIRED_ROLES[fileType],
    ...OPTIONAL_ROLES[fileType],
  ];

  for (const role of allRoles) {
    // Check user mapping first
    if (userMappingMap.has(role)) {
      const columnName = userMappingMap.get(role)!;
      if (headers.includes(columnName)) {
        mapping.set(role, columnName);
        continue;
      }
    }

    // Fallback to default patterns
    const patterns = DEFAULT_COLUMN_PATTERNS[role] || [];
    for (const pattern of patterns) {
      if (headers.includes(pattern)) {
        mapping.set(role, pattern);
        break;
      }
    }
  }

  return mapping;
}

/**
 * Check if all required columns are mapped
 * 
 * @param fileType - Type of file being uploaded
 * @param mapping - Resolved column mapping
 * @returns Object with { valid: boolean, missing: string[] }
 */
export function validateRequiredColumns(
  fileType: FileTypeForMapping,
  mapping: Map<string, string>
): { valid: boolean; missing: string[] } {
  const required = REQUIRED_ROLES[fileType];
  const missing: string[] = [];

  for (const role of required) {
    if (!mapping.has(role)) {
      missing.push(role);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Get value from a CSV row using the mapping
 * 
 * @param row - CSV row object
 * @param semanticRole - The semantic role to retrieve
 * @param mapping - Resolved column mapping
 * @returns The value or undefined
 */
export function getMappedValue(
  row: any,
  semanticRole: string,
  mapping: Map<string, string>
): string | undefined {
  const columnName = mapping.get(semanticRole);
  if (!columnName) {
    return undefined;
  }
  
  const value = row[columnName];
  return value !== undefined && value !== null ? String(value).trim() : undefined;
}
