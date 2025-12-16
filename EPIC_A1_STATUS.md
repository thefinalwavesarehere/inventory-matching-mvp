# Epic A1 Status Report: Excel Review Round-Trip

**Date:** December 16, 2025  
**Status:** ✅ Schema Complete | ⚠️ Export Incomplete | ❌ Import Missing

---

## 📊 Current Implementation Status

### ✅ COMPLETE: Database Schema (A1.1)

**All required fields are already in the schema!**

#### MatchCandidate Model (Lines 234-264)
```prisma
model MatchCandidate {
  id               String   @id @default(cuid())
  projectId        String   // ✅ Stable ID
  project          Project  @relation(...)
  storeItemId      String
  storeItem        StoreItem @relation(...)
  targetType       TargetType // INVENTORY or SUPPLIER
  targetId         String
  method           MatchMethod // ✅ Includes EXACT, FUZZY, AI, WEB
  confidence       Float
  features         Json
  matchStage       Int?
  rulesApplied     Json?
  costDifference   Decimal?
  costSimilarity   Float?
  transformationSignature String?
  status           MatchStatus @default(PENDING) // ✅ PENDING, CONFIRMED, REJECTED
  decidedById      String?
  decidedBy        User?
  decidedAt        DateTime?
  note             String?
  
  // ✅ Epic A1 Excel review fields (ALREADY ADDED!)
  vendorAction     VendorAction @default(NONE) // ✅ NONE, LIFT, REBOX, UNKNOWN, CONTACT_VENDOR
  correctedSupplierPartNumber String? // ✅ Nullable
  reviewSource     ReviewSource? // ✅ UI, EXCEL
  reviewedAt       DateTime? // ✅ Nullable
  reviewedByUserId String? // ✅ Nullable
  
  enrichmentData   EnrichmentData[]
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
}
```

#### Enums (Lines 276-311)
```prisma
enum MatchMethod {
  INTERCHANGE
  EXACT_NORM
  EXACT_NORMALIZED // ✅ Maps to "EXACT"
  LINE_PN
  DESC_SIM
  FUZZY // ✅ Maps to "FUZZY"
  FUZZY_SUBSTRING
  AI // ✅ Maps to "AI"
  WEB_SEARCH // ✅ Maps to "WEB"
  RULE_BASED
}

enum MatchStatus {
  PENDING // ✅ Required
  CONFIRMED // ✅ Maps to "ACCEPTED"
  REJECTED // ✅ Required
}

enum VendorAction {
  NONE // ✅ Default
  LIFT // ✅ Required
  REBOX // ✅ Required
  UNKNOWN // ✅ Required
  CONTACT_VENDOR // ✅ Required
}

enum ReviewSource {
  UI // ✅ Required
  EXCEL // ✅ Required
}
```

**Migration Status:**
- ✅ Migration file exists: `20251208110101_add_excel_review_fields`
- ⚠️ Migration not yet applied (pending baseline fix)
- ✅ Schema uncommented and ready

---

### ⚠️ INCOMPLETE: CSV Export (A1.2)

**Current Implementation:** `app/api/match/export/route.ts`

#### What's Working:
- ✅ Exports matches to CSV
- ✅ Includes store item data (part number, description, cost, quantity)
- ✅ Includes supplier data (part number, supplier name, description, cost)
- ✅ Includes match metadata (status, confidence, method)
- ✅ Filters by status (pending, confirmed, rejected, all)

#### What's MISSING (Epic A1 Requirements):
- ❌ **vendorAction** column not exported
- ❌ **correctedSupplierPartNumber** column not exported
- ❌ **reviewSource** column not exported
- ❌ **reviewedAt** column not exported
- ❌ **reviewedByUserId** column not exported
- ❌ **Match ID** column not exported (required for re-import!)
- ❌ **Project ID** column not exported (required for re-import!)
- ⚠️ Status uses internal values (PENDING, CONFIRMED, REJECTED) instead of user-friendly (Pending, Accepted, Rejected)
- ⚠️ Method uses internal values (EXACT_NORMALIZED, FUZZY, AI, WEB_SEARCH) instead of friendly (EXACT, FUZZY, AI, WEB)

#### Current CSV Headers (15 columns):
```
Match Status, Confidence, Match Method, Store Part Number, Store Line, 
Store Description, Store Cost, Store Quantity, Supplier Part Number, 
Supplier Name, Supplier Description, Supplier Cost, Supplier Quantity, 
Source URL, Match Features
```

#### Required CSV Headers (22 columns for Epic A1):
```
Match ID, Project ID, Match Status, Confidence, Match Method, 
Store Part Number, Store Line, Store Description, Store Cost, Store Quantity, 
Supplier Part Number, Supplier Name, Supplier Description, Supplier Cost, Supplier Quantity, 
Vendor Action, Corrected Supplier Part Number, Review Source, Reviewed At, Reviewed By User ID,
Source URL, Match Features
```

---

### ❌ MISSING: CSV Import (A1.3)

**No implementation found.**

**Required functionality:**
- ❌ API endpoint to accept CSV upload
- ❌ Parse CSV and validate headers
- ❌ Match rows to existing MatchCandidate records by Match ID
- ❌ Update fields:
  - `status` (from "Match Status" column)
  - `vendorAction` (from "Vendor Action" column)
  - `correctedSupplierPartNumber` (from "Corrected Supplier Part Number" column)
  - `reviewSource` = "EXCEL"
  - `reviewedAt` = current timestamp
  - `reviewedByUserId` = current user ID
- ❌ Validation:
  - Match ID must exist
  - Project ID must match
  - Status must be valid (Pending, Accepted, Rejected)
  - Vendor Action must be valid (NONE, LIFT, REBOX, UNKNOWN, CONTACT_VENDOR)
- ❌ Error handling and reporting
- ❌ Bulk update transaction (all or nothing)

---

### ❌ MISSING: TypeScript Types (A1.4)

**No centralized types file found.**

**Current state:**
- ✅ Prisma generates types automatically in `node_modules/@prisma/client`
- ❌ No custom TypeScript types in `types/` directory
- ❌ No exported enums for frontend use

**Required:**
- Create `types/match.ts` with:
  - `MatchStatus` enum (PENDING, CONFIRMED, REJECTED)
  - `MatchMethod` enum (all values)
  - `VendorAction` enum (NONE, LIFT, REBOX, UNKNOWN, CONTACT_VENDOR)
  - `ReviewSource` enum (UI, EXCEL)
  - `MatchCandidateWithRelations` type
  - `CSVExportRow` type
  - `CSVImportRow` type

---

## 🎯 Action Plan to Complete Epic A1

### Phase 1: Fix Migration Baseline (BLOCKING)
**Status:** ⏳ Waiting for user to run resolve command

```bash
DATABASE_URL="your-url" pnpm prisma migrate resolve --applied 20241108000000_revolutionary_rebuild
```

**Then redeploy to apply:** `20251208110101_add_excel_review_fields`

---

### Phase 2: Enhance CSV Export ⚠️ PRIORITY

**File:** `app/api/match/export/route.ts`

**Changes needed:**

1. **Add missing columns to headers array (line 49):**
```typescript
const headers = [
  'Match ID',           // NEW
  'Project ID',         // NEW
  'Match Status',
  'Confidence',
  'Match Method',
  'Store Part Number',
  'Store Line',
  'Store Description',
  'Store Cost',
  'Store Quantity',
  'Supplier Part Number',
  'Supplier Name',
  'Supplier Description',
  'Supplier Cost',
  'Supplier Quantity',
  'Vendor Action',      // NEW
  'Corrected Supplier Part Number', // NEW
  'Review Source',      // NEW
  'Reviewed At',        // NEW
  'Reviewed By User ID', // NEW
  'Source URL',
  'Match Features',
];
```

2. **Update row mapping (line 67):**
```typescript
const rows = matches.map(match => {
  // ... existing code ...
  
  // Format status for user-friendly display
  const statusDisplay = match.status === 'CONFIRMED' ? 'Accepted' : 
                       match.status === 'REJECTED' ? 'Rejected' : 
                       'Pending';
  
  // Format method for user-friendly display
  const methodDisplay = match.method === 'EXACT_NORMALIZED' ? 'EXACT' :
                       match.method === 'EXACT_NORM' ? 'EXACT' :
                       match.method === 'WEB_SEARCH' ? 'WEB' :
                       match.method;
  
  // Format vendor action
  const vendorActionDisplay = match.vendorAction || 'NONE';
  
  // Format dates
  const reviewedAtDisplay = match.reviewedAt ? 
    new Date(match.reviewedAt).toISOString() : '';
  
  return [
    match.id,                          // Match ID
    match.projectId,                   // Project ID
    statusDisplay,                     // Match Status (user-friendly)
    (match.confidence * 100).toFixed(1) + '%',
    methodDisplay,                     // Match Method (user-friendly)
    storeItem.partNumber,
    storeItem.lineCode || '',
    storeItem.description || '',
    storeItem.currentCost ? `$${storeItem.currentCost}` : '',
    storeItem.quantity?.toString() || '',
    supplierPartNumber,
    supplierName,
    supplierDescription,
    supplierCost,
    supplierQuantity,
    vendorActionDisplay,               // Vendor Action
    match.correctedSupplierPartNumber || '', // Corrected Supplier Part Number
    match.reviewSource || '',          // Review Source
    reviewedAtDisplay,                 // Reviewed At
    match.reviewedByUserId || '',      // Reviewed By User ID
    sourceUrl,
    features,
  ];
});
```

---

### Phase 3: Implement CSV Import ❌ NEW FEATURE

**Create:** `app/api/match/import/route.ts`

**Implementation:**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/lib/db/prisma';
import { parse } from 'csv-parse/sync';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const userId = formData.get('userId') as string; // From session
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    
    // Parse CSV
    const csvText = await file.text();
    const records = parse(csvText, {
      columns: true,
      skip_empty_lines: true,
    });
    
    // Validate headers
    const requiredHeaders = ['Match ID', 'Project ID', 'Match Status', 'Vendor Action'];
    const headers = Object.keys(records[0] || {});
    const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
    
    if (missingHeaders.length > 0) {
      return NextResponse.json({
        error: `Missing required headers: ${missingHeaders.join(', ')}`
      }, { status: 400 });
    }
    
    // Process updates in transaction
    const updates = [];
    const errors = [];
    
    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      const matchId = row['Match ID'];
      const projectId = row['Project ID'];
      
      // Validate match exists
      const match = await prisma.matchCandidate.findUnique({
        where: { id: matchId },
      });
      
      if (!match) {
        errors.push({ row: i + 2, error: `Match ID ${matchId} not found` });
        continue;
      }
      
      if (match.projectId !== projectId) {
        errors.push({ row: i + 2, error: `Project ID mismatch for Match ID ${matchId}` });
        continue;
      }
      
      // Map user-friendly status to internal
      const statusMap: Record<string, string> = {
        'Pending': 'PENDING',
        'Accepted': 'CONFIRMED',
        'Rejected': 'REJECTED',
      };
      const status = statusMap[row['Match Status']] || row['Match Status'];
      
      // Validate vendor action
      const validVendorActions = ['NONE', 'LIFT', 'REBOX', 'UNKNOWN', 'CONTACT_VENDOR'];
      const vendorAction = row['Vendor Action'] || 'NONE';
      if (!validVendorActions.includes(vendorAction)) {
        errors.push({ row: i + 2, error: `Invalid Vendor Action: ${vendorAction}` });
        continue;
      }
      
      updates.push({
        id: matchId,
        data: {
          status,
          vendorAction,
          correctedSupplierPartNumber: row['Corrected Supplier Part Number'] || null,
          reviewSource: 'EXCEL',
          reviewedAt: new Date(),
          reviewedByUserId: userId,
        },
      });
    }
    
    // Apply updates in transaction
    if (errors.length === 0) {
      await prisma.$transaction(
        updates.map(update =>
          prisma.matchCandidate.update({
            where: { id: update.id },
            data: update.data,
          })
        )
      );
      
      return NextResponse.json({
        success: true,
        updated: updates.length,
        errors: [],
      });
    } else {
      return NextResponse.json({
        success: false,
        updated: 0,
        errors,
      }, { status: 400 });
    }
    
  } catch (error: any) {
    console.error('[IMPORT] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to import matches' },
      { status: 500 }
    );
  }
}
```

---

### Phase 4: Create TypeScript Types

**Create:** `types/match.ts`

```typescript
// Re-export Prisma enums
export { MatchStatus, MatchMethod, VendorAction, ReviewSource } from '@prisma/client';

// CSV Export row type
export interface CSVExportRow {
  matchId: string;
  projectId: string;
  matchStatus: string;
  confidence: string;
  matchMethod: string;
  storePartNumber: string;
  storeLine: string;
  storeDescription: string;
  storeCost: string;
  storeQuantity: string;
  supplierPartNumber: string;
  supplierName: string;
  supplierDescription: string;
  supplierCost: string;
  supplierQuantity: string;
  vendorAction: string;
  correctedSupplierPartNumber: string;
  reviewSource: string;
  reviewedAt: string;
  reviewedByUserId: string;
  sourceUrl: string;
  matchFeatures: string;
}

// CSV Import row type
export interface CSVImportRow {
  'Match ID': string;
  'Project ID': string;
  'Match Status': 'Pending' | 'Accepted' | 'Rejected';
  'Vendor Action': 'NONE' | 'LIFT' | 'REBOX' | 'UNKNOWN' | 'CONTACT_VENDOR';
  'Corrected Supplier Part Number'?: string;
}

// User-friendly enum mappings
export const MatchStatusDisplay: Record<string, string> = {
  PENDING: 'Pending',
  CONFIRMED: 'Accepted',
  REJECTED: 'Rejected',
};

export const MatchMethodDisplay: Record<string, string> = {
  EXACT_NORMALIZED: 'EXACT',
  EXACT_NORM: 'EXACT',
  FUZZY: 'FUZZY',
  FUZZY_SUBSTRING: 'FUZZY',
  AI: 'AI',
  WEB_SEARCH: 'WEB',
  INTERCHANGE: 'INTERCHANGE',
  LINE_PN: 'LINE_PN',
  DESC_SIM: 'DESC_SIM',
  RULE_BASED: 'RULE_BASED',
};
```

---

## 📋 Implementation Checklist

### Database Schema ✅
- [x] Add vendorAction field
- [x] Add correctedSupplierPartNumber field
- [x] Add reviewSource field
- [x] Add reviewedAt field
- [x] Add reviewedByUserId field
- [x] Create VendorAction enum
- [x] Create ReviewSource enum
- [x] Create migration file
- [ ] Apply migration to production (waiting for baseline fix)

### CSV Export ⚠️
- [x] Basic export functionality exists
- [ ] Add Match ID column
- [ ] Add Project ID column
- [ ] Add Vendor Action column
- [ ] Add Corrected Supplier Part Number column
- [ ] Add Review Source column
- [ ] Add Reviewed At column
- [ ] Add Reviewed By User ID column
- [ ] Convert status to user-friendly (Pending/Accepted/Rejected)
- [ ] Convert method to user-friendly (EXACT/FUZZY/AI/WEB)

### CSV Import ❌
- [ ] Create import API endpoint
- [ ] Parse CSV file
- [ ] Validate headers
- [ ] Validate Match ID exists
- [ ] Validate Project ID matches
- [ ] Map user-friendly status to internal
- [ ] Validate Vendor Action enum
- [ ] Update MatchCandidate records
- [ ] Set reviewSource = EXCEL
- [ ] Set reviewedAt = current timestamp
- [ ] Set reviewedByUserId = current user
- [ ] Transaction-based updates (all or nothing)
- [ ] Error reporting

### TypeScript Types ❌
- [ ] Create types/match.ts
- [ ] Export Prisma enums
- [ ] Define CSVExportRow interface
- [ ] Define CSVImportRow interface
- [ ] Define status display mappings
- [ ] Define method display mappings

### Testing ❌
- [ ] Test CSV export with all fields
- [ ] Test CSV import with valid data
- [ ] Test CSV import with invalid data
- [ ] Test round-trip (export → edit → import)
- [ ] Test error handling
- [ ] Test transaction rollback on errors

---

## 🚀 Next Steps

1. **IMMEDIATE:** Fix migration baseline (user action required)
2. **PRIORITY:** Enhance CSV export with Epic A1 fields
3. **NEXT:** Implement CSV import functionality
4. **THEN:** Create TypeScript types
5. **FINALLY:** Test complete round-trip workflow

---

**Epic A1 is 40% complete. Schema is done, export needs enhancement, import needs implementation.**
