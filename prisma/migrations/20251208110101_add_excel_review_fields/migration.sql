-- CreateEnum
CREATE TYPE "VendorAction" AS ENUM ('NONE', 'LIFT', 'REBOX', 'UNKNOWN', 'CONTACT_VENDOR');

-- CreateEnum
CREATE TYPE "ReviewSource" AS ENUM ('UI', 'EXCEL');

-- AlterTable
ALTER TABLE "match_candidates" ADD COLUMN     "vendorAction" "VendorAction" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "correctedSupplierPartNumber" TEXT,
ADD COLUMN     "reviewSource" "ReviewSource",
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedByUserId" TEXT;
