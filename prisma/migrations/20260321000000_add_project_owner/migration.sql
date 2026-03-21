-- AddColumn: projects.created_by_id for tenant isolation (IDOR protection)
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "created_by_id" TEXT;

-- FK to user_profiles (nullable, SetNull on delete)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_created_by_id_fkey'
  ) THEN
    ALTER TABLE "projects"
      ADD CONSTRAINT "projects_created_by_id_fkey"
      FOREIGN KEY ("created_by_id")
      REFERENCES "user_profiles"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

-- Index for ownership lookups
CREATE INDEX IF NOT EXISTS "projects_created_by_id_idx" ON "projects"("created_by_id");
