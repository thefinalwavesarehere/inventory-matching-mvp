-- AlterTable
ALTER TABLE "user_profiles" ADD COLUMN "is_approved" BOOLEAN NOT NULL DEFAULT false;

-- Update existing admin users to be approved
UPDATE "user_profiles" SET "is_approved" = true WHERE "role" = 'ADMIN';

-- Add index for faster approval queries
CREATE INDEX "user_profiles_is_approved_idx" ON "user_profiles"("is_approved");
