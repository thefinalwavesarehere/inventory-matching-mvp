# Inventory Matching MVP - Rebuild Design

## Overview
This document outlines the clean, simplified rebuild of the inventory matching MVP system for Arnold Motor Supply.

## System Architecture

### Technology Stack
- **Frontend**: Next.js 13+ with App Router, React, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes (serverless)
- **Data Storage**: In-memory (no database required for MVP)
- **Matching Algorithm**: Simple string similarity and rule-based matching

### Key Simplifications
1. **No Database**: All data stored in memory using sample data
2. **No File Upload**: Pre-populated with test data
3. **Simple Matching**: Basic string similarity without ML/TensorFlow
4. **Clean Code**: Minimal dependencies, clear structure

## Data Model

### Arnold Inventory Item
```typescript
interface InventoryItem {
  lineCode: string;          // e.g., "AUV", "AXL"
  partNumber: string;         // e.g., "AUV14717"
  description: string;        // Product description
  unitPrice: number;          // Price per unit
  quantity: number;           // Quantity in stock
  unitOfIssue: string;        // "BOX", "EACH", etc.
  piecesPerBox?: number;      // If unit is BOX
}
```

### Supplier Catalog Item
```typescript
interface SupplierItem {
  supplierId: string;         // e.g., "carquest"
  supplierLineCode: string;   // Supplier's line code
  supplierPartNumber: string; // Supplier's part number
  description: string;        // Product description
  unitPrice: number;          // Supplier's price
  unitOfIssue: string;        // "EACH", "BOX", etc.
}
```

### Match Result
```typescript
interface Match {
  arnoldItem: InventoryItem;
  supplierItem: SupplierItem;
  confidenceScore: number;    // 0.0 to 1.0
  matchReasons: string[];     // Explanation of match
}
```

## Matching Algorithm

### Scoring Components
1. **Line Code Compatibility (40%)**: Check known mappings
2. **Part Number Similarity (30%)**: String similarity
3. **Description Similarity (30%)**: Word token matching

### Threshold
- Minimum confidence score: 0.7 (70%)

## Test Data

### Arnold Inventory (10 items)
- Mix of different line codes (AUV, AXL, BRK, FIL, etc.)
- Various unit types (BOX, EACH)
- Different price ranges

### Supplier Catalog (12 items)
- Corresponding items with slight variations
- Some exact matches, some partial matches
- Some non-matching items to test filtering

### Expected Matches
- 6-8 high-confidence matches (>80%)
- 2-3 medium-confidence matches (70-80%)
- Some items with no matches

## File Structure

```
app/
├── page.tsx                    # Home page
├── demo/
│   └── page.tsx               # Demo page with matches
├── api/
│   └── match/
│       └── route.ts           # Match API endpoint
├── lib/
│   ├── types.ts               # TypeScript interfaces
│   ├── sampleData.ts          # Test data
│   └── matching.ts            # Matching algorithm
└── components/
    ├── MatchList.tsx          # List of matches
    └── MatchDetail.tsx        # Match detail view
```

## Implementation Plan

1. **Clean up existing code**
   - Remove MongoDB/Mongoose dependencies
   - Remove TensorFlow dependencies
   - Remove file upload functionality
   - Simplify API routes

2. **Create comprehensive test data**
   - 10 Arnold inventory items
   - 12 supplier catalog items
   - Realistic automotive parts data

3. **Implement clean matching algorithm**
   - Simple, readable code
   - Clear scoring logic
   - Good comments

4. **Build clean UI**
   - Simple, professional design
   - Clear match visualization
   - Easy to understand confidence scores

## Success Criteria

- ✅ Application runs without errors
- ✅ Demo page shows matches immediately
- ✅ Matches are accurate and explainable
- ✅ Code is clean, simple, and well-commented
- ✅ No external dependencies (DB, ML libraries)
- ✅ Professional UI/UX

