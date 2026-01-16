-- Fix match_candidates.decidedById foreign key to reference user_profiles instead of users

-- Drop existing foreign key constraint
ALTER TABLE "match_candidates" DROP CONSTRAINT IF EXISTS "match_candidates_decidedById_fkey";

-- Nullify decidedByIds that don't exist in user_profiles (from old users table)
UPDATE "match_candidates" 
SET "decidedById" = NULL 
WHERE "decidedById" IS NOT NULL 
  AND "decidedById" NOT IN (SELECT id FROM "user_profiles");

-- Add new foreign key constraint to user_profiles
ALTER TABLE "match_candidates" ADD CONSTRAINT "match_candidates_decidedById_fkey" 
  FOREIGN KEY ("decidedById") REFERENCES "user_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
