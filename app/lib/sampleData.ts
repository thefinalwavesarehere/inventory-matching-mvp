/**
 * Enhanced Sample Test Data for Inventory Matching MVP
 * Demonstrates various matching scenarios including unit normalization
 */

import { InventoryItem, SupplierItem } from './types';

/**
 * Arnold Motor Supply Inventory
 * 15 items demonstrating various matching scenarios
 */
export const arnoldInventory: InventoryItem[] = [
  // Scenario 1: Exact match with BOX to EACH conversion
  {
    lineCode: 'AUV',
    partNumber: 'AUV14717',
    description: 'Auveco Body Clip Assortment Kit',
    unitPrice: 24.99,
    quantity: 50,
    unitOfIssue: 'BOX',
    piecesPerBox: 25
  },
  
  // Scenario 2: Exact match - same part, same unit
  {
    lineCode: 'AXL',
    partNumber: 'AXL5678',
    description: 'CV Axle Shaft Assembly - Front Right',
    unitPrice: 129.99,
    quantity: 10,
    unitOfIssue: 'EACH'
  },
  
  // Scenario 3: BOX to EACH conversion with different part number format
  {
    lineCode: 'AUV',
    partNumber: 'AUV9876',
    description: 'Door Handle Repair Kit Universal',
    unitPrice: 45.50,
    quantity: 15,
    unitOfIssue: 'BOX',
    piecesPerBox: 10
  },
  
  // Scenario 4: Exact match - brake pads
  {
    lineCode: 'BRK',
    partNumber: 'BRK2345',
    description: 'Ceramic Brake Pad Set - Front',
    unitPrice: 89.99,
    quantity: 25,
    unitOfIssue: 'EACH'
  },
  
  // Scenario 5: Exact match - oil filter
  {
    lineCode: 'FIL',
    partNumber: 'FIL8901',
    description: 'Engine Oil Filter - Standard',
    unitPrice: 8.99,
    quantity: 100,
    unitOfIssue: 'EACH'
  },
  
  // Scenario 6: Fuzzy match - slight part number variation
  {
    lineCode: 'BLT',
    partNumber: 'BLT3456',
    description: 'Serpentine Belt - 6 Rib 60 Inch',
    unitPrice: 24.50,
    quantity: 30,
    unitOfIssue: 'EACH'
  },
  
  // Scenario 7: BOX to EACH conversion - spark plugs
  {
    lineCode: 'SPK',
    partNumber: 'SPK7890',
    description: 'Iridium Spark Plug Set',
    unitPrice: 51.96,
    quantity: 75,
    unitOfIssue: 'BOX',
    piecesPerBox: 4
  },
  
  // Scenario 8: Description variation match
  {
    lineCode: 'WPR',
    partNumber: 'WPR4567',
    description: 'Windshield Wiper Blade - 22 Inch',
    unitPrice: 15.99,
    quantity: 40,
    unitOfIssue: 'EACH'
  },
  
  // Scenario 9: Fuzzy match - battery with slight description difference
  {
    lineCode: 'BAT',
    partNumber: 'BAT1234',
    description: 'Automotive Battery 12V 650CCA',
    unitPrice: 149.99,
    quantity: 12,
    unitOfIssue: 'EACH'
  },
  
  // Scenario 10: BOX to EACH conversion - plastic rivets
  {
    lineCode: 'AUV',
    partNumber: 'AUV5555',
    description: 'Plastic Rivet Assortment - Interior Trim',
    unitPrice: 18.75,
    quantity: 60,
    unitOfIssue: 'BOX',
    piecesPerBox: 50
  },
  
  // Scenario 11: Line code mapping - air filter
  {
    lineCode: 'FIL',
    partNumber: 'FIL3344',
    description: 'Cabin Air Filter - Premium',
    unitPrice: 14.99,
    quantity: 80,
    unitOfIssue: 'EACH'
  },
  
  // Scenario 12: BOX to EACH - fuses
  {
    lineCode: 'ELC',
    partNumber: 'ELC9988',
    description: 'Automotive Fuse Assortment',
    unitPrice: 12.99,
    quantity: 100,
    unitOfIssue: 'BOX',
    piecesPerBox: 20
  },
  
  // Scenario 13: High-value item - alternator
  {
    lineCode: 'ALT',
    partNumber: 'ALT2200',
    description: 'Alternator 120 Amp Remanufactured',
    unitPrice: 189.99,
    quantity: 8,
    unitOfIssue: 'EACH'
  },
  
  // Scenario 14: BOX to EACH - hose clamps
  {
    lineCode: 'AUV',
    partNumber: 'AUV7711',
    description: 'Hose Clamp Assortment Kit',
    unitPrice: 22.50,
    quantity: 45,
    unitOfIssue: 'BOX',
    piecesPerBox: 15
  },
  
  // Scenario 15: Partial match - thermostat
  {
    lineCode: 'THM',
    partNumber: 'THM5566',
    description: 'Engine Coolant Thermostat 195F',
    unitPrice: 18.99,
    quantity: 35,
    unitOfIssue: 'EACH'
  }
];

/**
 * Supplier (CarQuest) Catalog
 * 18 items with various matching scenarios
 */
export const supplierCatalog: SupplierItem[] = [
  // Match for AUV14717 - BOX to EACH conversion (25 pieces)
  {
    supplierId: 'carquest',
    supplierLineCode: 'ABH',
    supplierPartNumber: 'ABH14717',
    description: 'Body Clip Assortment Kit',
    unitPrice: 0.99,  // Price per piece
    unitOfIssue: 'EACH'
  },
  
  // Match for AXL5678 - exact match
  {
    supplierId: 'carquest',
    supplierLineCode: 'RDS',
    supplierPartNumber: 'RDS5678',
    description: 'CV Axle Shaft Assembly Front Right Side',
    unitPrice: 129.99,
    unitOfIssue: 'EACH'
  },
  
  // Match for AUV9876 - BOX to EACH conversion (10 pieces)
  {
    supplierId: 'carquest',
    supplierLineCode: 'ABH',
    supplierPartNumber: 'ABH9876',
    description: 'Universal Door Handle Repair Kit',
    unitPrice: 4.55,  // Price per piece
    unitOfIssue: 'EACH'
  },
  
  // Match for BRK2345 - exact match
  {
    supplierId: 'carquest',
    supplierLineCode: 'BRK',
    supplierPartNumber: 'BRK2345',
    description: 'Front Ceramic Brake Pad Set',
    unitPrice: 89.99,
    unitOfIssue: 'EACH'
  },
  
  // Match for FIL8901 - exact match
  {
    supplierId: 'carquest',
    supplierLineCode: 'FIL',
    supplierPartNumber: 'FIL8901',
    description: 'Standard Engine Oil Filter',
    unitPrice: 8.99,
    unitOfIssue: 'EACH'
  },
  
  // Match for BLT3456 - fuzzy match (part number variation)
  {
    supplierId: 'carquest',
    supplierLineCode: 'BLT',
    supplierPartNumber: 'BLT3450',
    description: 'Serpentine Belt 6-Rib 60"',
    unitPrice: 23.99,
    unitOfIssue: 'EACH'
  },
  
  // Match for SPK7890 - BOX to EACH conversion (4 pieces)
  {
    supplierId: 'carquest',
    supplierLineCode: 'SPK',
    supplierPartNumber: 'SPK7895',
    description: 'Iridium Spark Plug 4-Pack',
    unitPrice: 12.99,  // Price per piece
    unitOfIssue: 'EACH'
  },
  
  // Match for WPR4567 - description variation
  {
    supplierId: 'carquest',
    supplierLineCode: 'WPR',
    supplierPartNumber: 'WPR4560',
    description: 'Wiper Blade 22"',
    unitPrice: 15.99,
    unitOfIssue: 'EACH'
  },
  
  // Match for BAT1234 - fuzzy match
  {
    supplierId: 'carquest',
    supplierLineCode: 'BAT',
    supplierPartNumber: 'BAT1200',
    description: '12V Automotive Battery 650 CCA',
    unitPrice: 149.99,
    unitOfIssue: 'EACH'
  },
  
  // Match for AUV5555 - BOX to EACH conversion (50 pieces)
  {
    supplierId: 'carquest',
    supplierLineCode: 'ABH',
    supplierPartNumber: 'ABH5550',
    description: 'Interior Trim Plastic Rivet Assortment',
    unitPrice: 0.38,  // Price per piece
    unitOfIssue: 'EACH'
  },
  
  // Match for FIL3344 - cabin filter
  {
    supplierId: 'carquest',
    supplierLineCode: 'FIL',
    supplierPartNumber: 'FIL3344',
    description: 'Premium Cabin Air Filter',
    unitPrice: 14.99,
    unitOfIssue: 'EACH'
  },
  
  // Match for ELC9988 - BOX to EACH conversion (20 pieces)
  {
    supplierId: 'carquest',
    supplierLineCode: 'ELC',
    supplierPartNumber: 'ELC9988',
    description: 'Automotive Fuse Assortment 20pc',
    unitPrice: 0.65,  // Price per piece
    unitOfIssue: 'EACH'
  },
  
  // Match for ALT2200 - alternator
  {
    supplierId: 'carquest',
    supplierLineCode: 'ALT',
    supplierPartNumber: 'ALT2200',
    description: '120A Alternator Remanufactured',
    unitPrice: 189.99,
    unitOfIssue: 'EACH'
  },
  
  // Match for AUV7711 - BOX to EACH conversion (15 pieces)
  {
    supplierId: 'carquest',
    supplierLineCode: 'ABH',
    supplierPartNumber: 'ABH7711',
    description: 'Hose Clamp Assortment 15pc Kit',
    unitPrice: 1.50,  // Price per piece
    unitOfIssue: 'EACH'
  },
  
  // Match for THM5566 - partial match
  {
    supplierId: 'carquest',
    supplierLineCode: 'THM',
    supplierPartNumber: 'THM5560',
    description: 'Coolant Thermostat 195 Degrees',
    unitPrice: 18.99,
    unitOfIssue: 'EACH'
  },
  
  // Non-matching items for testing
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
  
  {
    supplierId: 'carquest',
    supplierLineCode: 'OIL',
    supplierPartNumber: 'OIL5555',
    description: 'Motor Oil 5W-30 Synthetic - 5 Quart',
    unitPrice: 29.99,
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

