-- AlterTable: Add projectId to vendor_action_rules
-- This allows rules to be either global (projectId = NULL) or project-specific

ALTER TABLE "vendor_action_rules" ADD COLUMN "project_id" TEXT;

-- Add foreign key constraint
ALTER TABLE "vendor_action_rules" ADD CONSTRAINT "vendor_action_rules_project_id_fkey" 
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create index for efficient queries
CREATE INDEX "vendor_action_rules_project_id_idx" ON "vendor_action_rules"("project_id");

-- Comment explaining the design
COMMENT ON COLUMN "vendor_action_rules"."project_id" IS 'NULL = Global rule (applies to all projects), Present = Project-specific rule (overrides global)';
