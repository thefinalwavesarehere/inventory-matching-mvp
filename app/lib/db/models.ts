import mongoose from 'mongoose';

// Define schemas if using Mongoose
const inventoryItemSchema = new mongoose.Schema({
  lineCode: String,
  partNumber: String,
  description: String,
  unitPrice: Number,
  quantity: Number,
  unitOfIssue: String,
  piecesPerBox: Number,
  metadata: {
    type: Map,
    of: String
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
});

const supplierItemSchema = new mongoose.Schema({
  supplierId: String,
  supplierLineCode: String,
  supplierPartNumber: String,
  description: String,
  unitPrice: Number,
  unitOfIssue: String,
  metadata: {
    type: Map,
    of: String
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
});

const interchangeSchema = new mongoose.Schema({
  sourceItemId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'InventoryItem'
  },
  targetItemId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SupplierItem'
  },
  confidenceScore: Number,
  matchType: String,
  matchReason: [String],
  unitConversion: {
    ratio: Number,
    formula: String
  },
  createdDate: {
    type: Date,
    default: Date.now
  },
  lastVerified: Date,
  verifiedBy: String
});

// Only create models if they don't already exist
// This is important for Next.js hot reloading
export const InventoryItem = mongoose.models.InventoryItem || 
  mongoose.model('InventoryItem', inventoryItemSchema);

export const SupplierItem = mongoose.models.SupplierItem || 
  mongoose.model('SupplierItem', supplierItemSchema);

export const Interchange = mongoose.models.Interchange || 
  mongoose.model('Interchange', interchangeSchema);

// Types for TypeScript
export interface IInventoryItem {
  _id?: string;
  lineCode: string;
  partNumber: string;
  description: string;
  unitPrice: number;
  quantity: number;
  unitOfIssue: string;
  piecesPerBox?: number;
  metadata?: Record<string, string>;
  lastUpdated?: Date;
}

export interface ISupplierItem {
  _id?: string;
  supplierId: string;
  supplierLineCode: string;
  supplierPartNumber: string;
  description: string;
  unitPrice: number;
  unitOfIssue: string;
  metadata?: Record<string, string>;
  lastUpdated?: Date;
}

export interface IInterchange {
  _id?: string;
  sourceItemId: string;
  targetItemId: string;
  confidenceScore: number;
  matchType: 'AUTO' | 'MANUAL' | 'CONFIRMED';
  matchReason: string[];
  unitConversion?: {
    ratio: number;
    formula: string;
  };
  createdDate?: Date;
  lastVerified?: Date;
  verifiedBy?: string;
}
