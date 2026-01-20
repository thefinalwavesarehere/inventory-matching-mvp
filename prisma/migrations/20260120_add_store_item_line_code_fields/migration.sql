-- AlterTable
ALTER TABLE "store_items" ADD COLUMN     "manufacturerName" TEXT,
ADD COLUMN     "manufacturerLineCode" TEXT,
ADD COLUMN     "lineCodePreprocessed" BOOLEAN NOT NULL DEFAULT false;
