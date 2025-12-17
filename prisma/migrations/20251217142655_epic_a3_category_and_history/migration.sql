-- AlterTable: Add category and subcategory to supplier_items
ALTER TABLE "supplier_items" ADD COLUMN "category" TEXT;
ALTER TABLE "supplier_items" ADD COLUMN "subcategory" TEXT;

-- AlterTable: Add category and subcategory to store_items
ALTER TABLE "store_items" ADD COLUMN "category" TEXT;
ALTER TABLE "store_items" ADD COLUMN "subcategory" TEXT;

-- CreateTable: AcceptedMatchHistory
CREATE TABLE "accepted_match_history" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "storePartNumber" TEXT NOT NULL,
    "supplierPartNumber" TEXT NOT NULL,
    "supplierLineCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accepted_match_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable: RejectedMatchHistory
CREATE TABLE "rejected_match_history" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "storePartNumber" TEXT NOT NULL,
    "supplierPartNumber" TEXT NOT NULL,
    "supplierLineCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rejected_match_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: supplier_items category
CREATE INDEX "supplier_items_category_idx" ON "supplier_items"("category");

-- CreateIndex: supplier_items subcategory
CREATE INDEX "supplier_items_subcategory_idx" ON "supplier_items"("subcategory");

-- CreateIndex: store_items category
CREATE INDEX "store_items_category_idx" ON "store_items"("category");

-- CreateIndex: store_items subcategory
CREATE INDEX "store_items_subcategory_idx" ON "store_items"("subcategory");

-- CreateIndex: accepted_match_history projectId
CREATE INDEX "accepted_match_history_projectId_idx" ON "accepted_match_history"("projectId");

-- CreateIndex: accepted_match_history part numbers
CREATE INDEX "accepted_match_history_storePartNumber_supplierPartNumber_idx" ON "accepted_match_history"("storePartNumber", "supplierPartNumber");

-- CreateIndex: accepted_match_history supplierLineCode
CREATE INDEX "accepted_match_history_supplierLineCode_idx" ON "accepted_match_history"("supplierLineCode");

-- CreateIndex: rejected_match_history projectId
CREATE INDEX "rejected_match_history_projectId_idx" ON "rejected_match_history"("projectId");

-- CreateIndex: rejected_match_history part numbers
CREATE INDEX "rejected_match_history_storePartNumber_supplierPartNumber_idx" ON "rejected_match_history"("storePartNumber", "supplierPartNumber");

-- CreateIndex: rejected_match_history supplierLineCode
CREATE INDEX "rejected_match_history_supplierLineCode_idx" ON "rejected_match_history"("supplierLineCode");
