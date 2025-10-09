/**
 * Sample test data for the Inventory Matching MVP
 * This data represents realistic automotive parts inventory
 */

import { InventoryItem, SupplierItem } from './types';

/**
 * Arnold Motor Supply Inventory
 * 10 items across different product categories
 */
export const arnoldInventory: InventoryItem[] = [
  {
    lineCode: 'AUV',
    partNumber: 'AUV14717',
    description: 'Auveco Body Clip Assortment Kit',
    unitPrice: 24.99,
    quantity: 50,
    unitOfIssue: 'BOX',
    piecesPerBox: 25
  },
  {
    lineCode: 'AXL',
    partNumber: 'AXL5678',
    description: 'CV Axle Shaft Assembly - Front Right',
    unitPrice: 129.99,
    quantity: 10,
    unitOfIssue: 'EACH'
  },
  {
    lineCode: 'AUV',
    partNumber: 'AUV9876',
    description: 'Door Handle Repair Kit Universal',
    unitPrice: 45.50,
    quantity: 15,
    unitOfIssue: 'BOX',
    piecesPerBox: 10
  },
  {
    lineCode: 'BRK',
    partNumber: 'BRK2345',
    description: 'Ceramic Brake Pad Set - Front',
    unitPrice: 89.99,
    quantity: 25,
    unitOfIssue: 'EACH'
  },
  {
    lineCode: 'FIL',
    partNumber: 'FIL8901',
    description: 'Engine Oil Filter - Standard',
    unitPrice: 8.99,
    quantity: 100,
    unitOfIssue: 'EACH'
  },
  {
    lineCode: 'BLT',
    partNumber: 'BLT3456',
    description: 'Serpentine Belt - 6 Rib 60 Inch',
    unitPrice: 24.50,
    quantity: 30,
    unitOfIssue: 'EACH'
  },
  {
    lineCode: 'SPK',
    partNumber: 'SPK7890',
    description: 'Iridium Spark Plug Set',
    unitPrice: 12.99,
    quantity: 75,
    unitOfIssue: 'BOX',
    piecesPerBox: 4
  },
  {
    lineCode: 'WPR',
    partNumber: 'WPR4567',
    description: 'Windshield Wiper Blade - 22 Inch',
    unitPrice: 15.99,
    quantity: 40,
    unitOfIssue: 'EACH'
  },
  {
    lineCode: 'BAT',
    partNumber: 'BAT1234',
    description: 'Automotive Battery 12V 650CCA',
    unitPrice: 149.99,
    quantity: 12,
    unitOfIssue: 'EACH'
  },
  {
    lineCode: 'AUV',
    partNumber: 'AUV5555',
    description: 'Plastic Rivet Assortment - Interior Trim',
    unitPrice: 18.75,
    quantity: 60,
    unitOfIssue: 'BOX',
    piecesPerBox: 50
  }
];

/**
 * Supplier (CarQuest) Catalog
 * 12 items with varying degrees of match to Arnold inventory
 */
export const supplierCatalog: SupplierItem[] = [
  // High confidence matches
  {
    supplierId: 'carquest',
    supplierLineCode: 'ABH',
    supplierPartNumber: 'ABH14717',
    description: 'Body Clip Assortment Kit',
    unitPrice: 0.99,
    unitOfIssue: 'EACH'
  },
  {
    supplierId: 'carquest',
    supplierLineCode: 'RDS',
    supplierPartNumber: 'RDS5678',
    description: 'CV Axle Shaft Assembly Front Right Side',
    unitPrice: 129.99,
    unitOfIssue: 'EACH'
  },
  {
    supplierId: 'carquest',
    supplierLineCode: 'ABH',
    supplierPartNumber: 'ABH9876',
    description: 'Universal Door Handle Repair Kit',
    unitPrice: 4.55,
    unitOfIssue: 'EACH'
  },
  {
    supplierId: 'carquest',
    supplierLineCode: 'BRK',
    supplierPartNumber: 'BRK2345',
    description: 'Front Ceramic Brake Pad Set',
    unitPrice: 89.99,
    unitOfIssue: 'EACH'
  },
  {
    supplierId: 'carquest',
    supplierLineCode: 'FIL',
    supplierPartNumber: 'FIL8901',
    description: 'Standard Engine Oil Filter',
    unitPrice: 8.99,
    unitOfIssue: 'EACH'
  },
  
  // Medium confidence matches
  {
    supplierId: 'carquest',
    supplierLineCode: 'BLT',
    supplierPartNumber: 'BLT3450',
    description: 'Serpentine Belt 6-Rib 60"',
    unitPrice: 23.99,
    unitOfIssue: 'EACH'
  },
  {
    supplierId: 'carquest',
    supplierLineCode: 'SPK',
    supplierPartNumber: 'SPK7895',
    description: 'Iridium Spark Plug 4-Pack',
    unitPrice: 3.25,
    unitOfIssue: 'EACH'
  },
  {
    supplierId: 'carquest',
    supplierLineCode: 'WPR',
    supplierPartNumber: 'WPR4560',
    description: 'Wiper Blade 22"',
    unitPrice: 15.99,
    unitOfIssue: 'EACH'
  },
  
  // Items with no clear match
  {
    supplierId: 'carquest',
    supplierLineCode: 'TIR',
    supplierPartNumber: 'TIR9999',
    description: 'All-Season Tire 225/65R17',
    unitPrice: 125.00,
    unitOfIssue: 'EACH'
  },
  {
    supplierId: 'carquest',
    supplierLineCode: 'ANT',
    supplierPartNumber: 'ANT7777',
    description: 'Antifreeze Coolant - 1 Gallon',
    unitPrice: 12.99,
    unitOfIssue: 'EACH'
  },
  
  // Additional match candidates
  {
    supplierId: 'carquest',
    supplierLineCode: 'BAT',
    supplierPartNumber: 'BAT1200',
    description: '12V Automotive Battery 650 CCA',
    unitPrice: 149.99,
    unitOfIssue: 'EACH'
  },
  {
    supplierId: 'carquest',
    supplierLineCode: 'ABH',
    supplierPartNumber: 'ABH5550',
    description: 'Interior Trim Plastic Rivet Assortment',
    unitPrice: 0.38,
    unitOfIssue: 'EACH'
  }
];

/**
 * Get all sample data
 */
export function getSampleData() {
  return {
    arnoldInventory,
    supplierCatalog
  };
}

