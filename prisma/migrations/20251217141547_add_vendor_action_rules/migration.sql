-- CreateTable
CREATE TABLE "vendor_action_rules" (
    "id" TEXT NOT NULL,
    "supplierLineCode" TEXT NOT NULL,
    "categoryPattern" TEXT NOT NULL,
    "subcategoryPattern" TEXT NOT NULL,
    "action" "VendorAction" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_action_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vendor_action_rules_supplierLineCode_idx" ON "vendor_action_rules"("supplierLineCode");

-- CreateIndex
CREATE INDEX "vendor_action_rules_active_idx" ON "vendor_action_rules"("active");
