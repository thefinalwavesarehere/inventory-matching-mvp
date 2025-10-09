/**
 * Type definitions for the Inventory Matching System
 */

export interface InventoryItem {
  lineCode: string;
  partNumber: string;
  description: string;
  unitPrice: number;
  quantity: number;
  unitOfIssue: string;
  piecesPerBox?: number;
}

export interface SupplierItem {
  supplierId: string;
  supplierLineCode: string;
  supplierPartNumber: string;
  description: string;
  unitPrice: number;
  unitOfIssue: string;
}

export interface Match {
  arnoldItem: InventoryItem;
  supplierItem: SupplierItem;
  confidenceScore: number;
  matchReasons: string[];
}

