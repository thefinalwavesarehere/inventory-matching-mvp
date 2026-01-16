-- Add projectId column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'vendor_action_rules' 
        AND column_name = 'projectId'
    ) THEN
        ALTER TABLE vendor_action_rules ADD COLUMN "projectId" TEXT;
        
        -- Add foreign key constraint
        ALTER TABLE vendor_action_rules
        ADD CONSTRAINT fk_vendor_action_rules_project
        FOREIGN KEY ("projectId") REFERENCES projects(id) ON DELETE CASCADE;
        
        -- Add index
        CREATE INDEX IF NOT EXISTS "vendor_action_rules_projectId_idx" ON vendor_action_rules("projectId");
    END IF;
END $$;
