-- CreateEnum
CREATE TYPE "FileTypeForMapping" AS ENUM ('STORE_INVENTORY', 'SUPPLIER_CATALOG', 'LINE_CODE_INTERCHANGE', 'PART_NUMBER_INTERCHANGE');

-- CreateTable
CREATE TABLE "file_column_mappings" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "fileType" "FileTypeForMapping" NOT NULL,
    "columnName" TEXT NOT NULL,
    "semanticRole" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "file_column_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "file_column_mappings_projectId_fileType_idx" ON "file_column_mappings"("projectId", "fileType");

-- CreateIndex
CREATE UNIQUE INDEX "file_column_mappings_projectId_fileType_semanticRole_key" ON "file_column_mappings"("projectId", "fileType", "semanticRole");

-- AddForeignKey
ALTER TABLE "file_column_mappings" ADD CONSTRAINT "file_column_mappings_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
