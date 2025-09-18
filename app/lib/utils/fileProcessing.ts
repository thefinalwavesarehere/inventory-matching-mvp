import * as XLSX from 'xlsx';
import { IInventoryItem, ISupplierItem } from '../db/models';

// Process Excel file and extract inventory items
export function processExcelFile(
  buffer: Buffer, 
  fileType: 'arnold' | 'supplier'
): IInventoryItem[] | ISupplierItem[] {
  // Read the Excel file
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  
  // Get the first sheet
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  
  // Convert to JSON
  const data = XLSX.utils.sheet_to_json(sheet);
  
  // Process based on file type
  if (fileType === 'arnold') {
    return processArnoldData(data);
  } else {
    return processSupplierData(data);
  }
}

// Process Arnold inventory data
function processArnoldData(data: any[]): IInventoryItem[] {
  return data.map(row => {
    // Map fields based on Arnold's file format
    // This is a simplified example - adjust field mappings as needed
    return {
      lineCode: row.LineCode || '',
      partNumber: row.PartNumber || '',
      description: row.Description || '',
      unitPrice: parseFloat(row.UnitPrice) || 0,
      quantity: parseInt(row.Quantity) || 0,
      unitOfIssue: row.UnitOfIssue || '',
      piecesPerBox: parseInt(row.PiecesPerBox) || 0,
      metadata: {}
    };
  });
}

// Process supplier data
function processSupplierData(data: any[]): ISupplierItem[] {
  return data.map(row => {
    // Map fields based on supplier's file format
    // This is a simplified example - adjust field mappings as needed
    return {
      supplierId: 'carquest', // Hardcoded for demo
      supplierLineCode: row.LineCode || '',
      supplierPartNumber: row.PartNumber || '',
      description: row.Description || '',
      unitPrice: parseFloat(row.UnitPrice) || 0,
      unitOfIssue: row.UnitOfIssue || '',
      metadata: {}
    };
  });
}

// Generate sample data for demonstration
export function generateSampleData(): {
  arnoldItems: IInventoryItem[];
  supplierItems: ISupplierItem[];
} {
  // Sample Arnold inventory items
  const arnoldItems: IInventoryItem[] = [
    {
      lineCode: 'AUV',
      partNumber: 'AUV14717',
      description: 'Auveco Body Clip Assortment',
      unitPrice: 24.99,
      quantity: 50,
      unitOfIssue: 'BOX',
      piecesPerBox: 25
    },
    {
      lineCode: 'AXL',
      partNumber: 'AXL5678',
      description: 'Axle Shaft Assembly',
      unitPrice: 129.99,
      quantity: 10,
      unitOfIssue: 'EACH'
    },
    {
      lineCode: 'AUV',
      partNumber: 'AUV9876',
      description: 'Door Handle Kit',
      unitPrice: 45.50,
      quantity: 15,
      unitOfIssue: 'BOX',
      piecesPerBox: 10
    }
  ];

  // Sample supplier items
  const supplierItems: ISupplierItem[] = [
    {
      supplierId: 'carquest',
      supplierLineCode: 'ABH',
      supplierPartNumber: 'ABH14717',
      description: 'Body Clip Assortment',
      unitPrice: 0.99,
      unitOfIssue: 'EACH'
    },
    {
      supplierId: 'carquest',
      supplierLineCode: 'RDS',
      supplierPartNumber: 'RDS5678',
      description: 'Axle Shaft Assembly - Passenger Side',
      unitPrice: 129.99,
      unitOfIssue: 'EACH'
    },
    {
      supplierId: 'carquest',
      supplierLineCode: 'ABH',
      supplierPartNumber: 'ABH9876',
      description: 'Universal Door Handle Kit',
      unitPrice: 4.55,
      unitOfIssue: 'EACH'
    }
  ];

  return { arnoldItems, supplierItems };
}
