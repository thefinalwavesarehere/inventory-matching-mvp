/**
 * Enhanced type definitions for the Inventory Matching System
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
  unitConversion?: UnitConversion;
  status?: MatchStatus;
}

export interface UnitConversion {
  needsConversion: boolean;
  conversionRatio?: number;
  normalizedSupplierPrice?: number;
  priceDifference?: number;
  priceMatchPercentage?: number;
}

export type MatchStatus = 'pending' | 'approved' | 'rejected' | 'review';

export interface MatchStatistics {
  totalMatches: number;
  highConfidence: number;
  mediumConfidence: number;
  lowConfidence: number;
  unitConversions: number;
  perfectPriceMatches: number;
  averageConfidence: number;
  totalValue: number;
}

export interface FilterOptions {
  confidenceMin?: number;
  confidenceMax?: number;
  lineCode?: string;
  unitConversion?: boolean;
  status?: MatchStatus;
}

export type SortField = 'confidence' | 'partNumber' | 'price' | 'lineCode';
export type SortDirection = 'asc' | 'desc';

