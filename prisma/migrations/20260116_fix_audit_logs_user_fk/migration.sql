-- Fix audit_logs foreign key to reference user_profiles instead of users

-- Drop existing foreign key constraint
ALTER TABLE "audit_logs" DROP CONSTRAINT IF EXISTS "audit_logs_userId_fkey";

-- Nullify userIds that don't exist in user_profiles (from old users table)
UPDATE "audit_logs" 
SET "userId" = NULL 
WHERE "userId" IS NOT NULL 
  AND "userId" NOT IN (SELECT id FROM "user_profiles");

-- Add new foreign key constraint to user_profiles
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" 
  FOREIGN KEY ("userId") REFERENCES "user_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
