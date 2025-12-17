-- CreateTable
CREATE TABLE "line_code_interchange" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "sourceLineCode" TEXT NOT NULL,
    "targetLineCode" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "line_code_interchange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "part_number_interchange" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sourceSupplierLineCode" TEXT NOT NULL,
    "sourcePartNumber" TEXT NOT NULL,
    "targetSupplierLineCode" TEXT NOT NULL,
    "targetPartNumber" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "part_number_interchange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "line_code_interchange_sourceLineCode_active_idx" ON "line_code_interchange"("sourceLineCode", "active");

-- CreateIndex
CREATE INDEX "line_code_interchange_projectId_idx" ON "line_code_interchange"("projectId");

-- CreateIndex
CREATE INDEX "line_code_interchange_priority_idx" ON "line_code_interchange"("priority");

-- CreateIndex
CREATE INDEX "part_number_interchange_sourceSupplierLineCode_sourcePartNu_idx" ON "part_number_interchange"("sourceSupplierLineCode", "sourcePartNumber", "active");

-- CreateIndex
CREATE INDEX "part_number_interchange_projectId_idx" ON "part_number_interchange"("projectId");

-- CreateIndex
CREATE INDEX "part_number_interchange_priority_idx" ON "part_number_interchange"("priority");
