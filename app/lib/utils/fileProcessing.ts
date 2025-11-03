import * as XLSX from 'xlsx';

// Type definitions for different file formats
export interface ArnoldInventoryRow {
  Part: string;
  TotalUsageLast12?: number;
  Cost?: number;
}

export interface SupplierCatalogRow {
  PART: string;
  LINE: string;
  'PART NUMBER': string;
  DESCRIPTION?: string;
  'QTY AVAIL'?: number;
  ' COST $'?: number; // Note: space before COST
  'YTD HIST'?: number;
}

export interface InterchangeRow {
  'Their SKU': string;
  'Our SKU': string;
}

export interface InventoryReportRow {
  LINE?: string;
  'PART NUMBER'?: string;
  DESCRIPTION?: string;
  'PN CODE'?: number;
  'QTY AVL'?: number;
  MIN?: number;
  MAX?: number;
  'ORDER POINT'?: number;
  'LAST SOLD DATE'?: string;
  'CREATE DATE'?: string;
  'QTY LOST'?: number;
  'SALES CLASS'?: string;
  'CURR COST $'?: number;
  'ROLLING 12'?: number;
  'ROLLING 24'?: number;
  VALUE?: number;
}

// Processed data types
export interface ProcessedArnoldItem {
  partNumber: string;
  usageLast12: number | null;
  cost: number | null;
  rawData: Record<string, any>;
}

export interface ProcessedSupplierItem {
  partFull: string;
  lineCode: string;
  partNumber: string;
  description: string | null;
  qtyAvail: number | null;
  cost: number | null;
  ytdHist: number | null;
  rawData: Record<string, any>;
}

export interface ProcessedInterchangeItem {
  supplierSku: string;
  arnoldSku: string;
}

export interface ProcessedInventoryReportItem {
  lineCode: string | null;
  partNumber: string | null;
  description: string | null;
  qtyAvail: number | null;
  cost: number | null;
  rawData: Record<string, any>;
}

/**
 * Main function to process Excel/CSV files based on file type
 */
export function processExcelFile(
  buffer: Buffer,
  fileType: 'arnold' | 'supplier' | 'interchange' | 'inventory_report'
): any[] {
  // Read the Excel file
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  // Get the first sheet
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // Convert to JSON
  const data = XLSX.utils.sheet_to_json(sheet);

  // Process based on file type
  switch (fileType) {
    case 'arnold':
      return processArnoldData(data as ArnoldInventoryRow[]);
    case 'supplier':
      return processSupplierData(data as SupplierCatalogRow[]);
    case 'interchange':
      return processInterchangeData(data as InterchangeRow[]);
    case 'inventory_report':
      return processInventoryReportData(data as InventoryReportRow[]);
    default:
      throw new Error(`Unknown file type: ${fileType}`);
  }
}

/**
 * Process Arnold inventory data
 * Expected columns: Part, TotalUsageLast12, Cost
 */
function processArnoldData(data: ArnoldInventoryRow[]): ProcessedArnoldItem[] {
  return data
    .filter(row => row.Part) // Filter out rows without part number
    .map(row => ({
      partNumber: String(row.Part).trim(),
      usageLast12: row.TotalUsageLast12 ? Number(row.TotalUsageLast12) : null,
      cost: row.Cost ? Number(row.Cost) : null,
      rawData: row as Record<string, any>,
    }));
}

/**
 * Process supplier catalog data (CarQuest format)
 * Expected columns: PART, LINE, PART NUMBER, DESCRIPTION, QTY AVAIL, COST $, YTD HIST
 */
function processSupplierData(data: SupplierCatalogRow[]): ProcessedSupplierItem[] {
  return data
    .filter(row => row.PART) // Filter out rows without part identifier
    .map(row => ({
      partFull: String(row.PART).trim(),
      lineCode: String(row.LINE || '').trim(),
      partNumber: String(row['PART NUMBER'] || '').trim(),
      description: row.DESCRIPTION ? String(row.DESCRIPTION).trim() : null,
      qtyAvail: row['QTY AVAIL'] ? Number(row['QTY AVAIL']) : null,
      cost: row[' COST $'] ? Number(row[' COST $']) : null, // Note: space before COST
      ytdHist: row['YTD HIST'] ? Number(row['YTD HIST']) : null,
      rawData: row as Record<string, any>,
    }));
}

/**
 * Process interchange mapping data
 * Expected columns: Their SKU, Our SKU
 */
function processInterchangeData(data: InterchangeRow[]): ProcessedInterchangeItem[] {
  return data
    .filter(row => row['Their SKU'] && row['Our SKU'])
    .map(row => ({
      supplierSku: String(row['Their SKU']).trim(),
      arnoldSku: String(row['Our SKU']).trim(),
    }));
}

/**
 * Process inventory report data
 * Expected columns: LINE, PART NUMBER, DESCRIPTION, QTY AVL, CURR COST $, etc.
 */
function processInventoryReportData(data: InventoryReportRow[]): ProcessedInventoryReportItem[] {
  return data
    .filter(row => row['PART NUMBER']) // Filter out rows without part number
    .map(row => ({
      lineCode: row.LINE ? String(row.LINE).trim() : null,
      partNumber: row['PART NUMBER'] ? String(row['PART NUMBER']).trim() : null,
      description: row.DESCRIPTION ? String(row.DESCRIPTION).trim() : null,
      qtyAvail: row['QTY AVL'] ? Number(row['QTY AVL']) : null,
      cost: row['CURR COST $'] ? Number(row['CURR COST $']) : null,
      rawData: row as Record<string, any>,
    }));
}

/**
 * Validate file structure based on expected columns
 */
export function validateFileStructure(
  buffer: Buffer,
  fileType: 'arnold' | 'supplier' | 'interchange' | 'inventory_report'
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

    if (data.length === 0) {
      errors.push('File is empty');
      return { valid: false, errors };
    }

    const headers = data[0] as string[];

    // Define expected columns for each file type
    const expectedColumns: Record<string, string[]> = {
      arnold: ['Part', 'TotalUsageLast12', 'Cost'],
      supplier: ['PART', 'LINE', 'PART NUMBER', 'DESCRIPTION'],
      interchange: ['Their SKU', 'Our SKU'],
      inventory_report: ['LINE', 'PART NUMBER', 'DESCRIPTION'],
    };

    const required = expectedColumns[fileType];
    const missing = required.filter(col => !headers.includes(col));

    if (missing.length > 0) {
      errors.push(`Missing required columns: ${missing.join(', ')}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  } catch (error) {
    errors.push(`Failed to parse file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return { valid: false, errors };
  }
}

/**
 * Get file type from file name or content
 */
export function detectFileType(fileName: string): 'arnold' | 'supplier' | 'interchange' | 'inventory_report' | null {
  const lowerName = fileName.toLowerCase();

  if (lowerName.includes('arnold')) return 'arnold';
  if (lowerName.includes('carquest') || lowerName.includes('cq')) return 'supplier';
  if (lowerName.includes('interchange')) return 'interchange';
  if (lowerName.includes('inventory') && lowerName.includes('report')) return 'inventory_report';

  return null;
}

/**
 * Extract line code from part number
 * Example: AUV20966 -> AUV
 */
export function extractLineCode(partNumber: string): string | null {
  const match = partNumber.match(/^([A-Z]+)/);
  return match ? match[1] : null;
}

/**
 * Normalize part number for comparison
 */
export function normalizePartNumber(partNumber: string): string {
  let normalized = partNumber
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .trim();
  
  // Remove common supplier prefixes to improve matching
  // These prefixes are often added by suppliers to Arnold part numbers
  const commonPrefixes = ['XBO', 'RDS', 'LUB', 'AXL', 'AUV', 'RDSNC', 'RDSNCV'];
  
  for (const prefix of commonPrefixes) {
    if (normalized.startsWith(prefix) && normalized.length > prefix.length + 4) {
      // Check if removing prefix leaves a valid-looking part number
      const withoutPrefix = normalized.substring(prefix.length);
      // Valid part numbers typically have 2-4 letters followed by 4+ digits
      if (withoutPrefix.match(/^[A-Z]{2,5}[0-9]{3,}/)) {
        normalized = withoutPrefix;
        break;  // Only remove one prefix
      }
    }
  }
  
  return normalized;
}

/**
 * Normalize description for comparison
 */
export function normalizeDescription(description: string): string {
  return description
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
