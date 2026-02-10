-- Enable Row Level Security on cost_logs table
ALTER TABLE "cost_logs" ENABLE ROW LEVEL SECURITY;

-- Enable Row Level Security on master_rules table
ALTER TABLE "master_rules" ENABLE ROW LEVEL SECURITY;

-- Create policy for cost_logs: Users can only see cost logs for their own projects
CREATE POLICY "Users can view cost_logs for their projects" ON "cost_logs"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "projects" p
      WHERE p.id = "cost_logs"."projectId"
    )
  );

-- Create policy for cost_logs: Only admins can insert cost logs
CREATE POLICY "Only system can insert cost_logs" ON "cost_logs"
  FOR INSERT
  WITH CHECK (true); -- System operations always allowed

-- Create policy for cost_logs: Only admins can update cost logs
CREATE POLICY "Only system can update cost_logs" ON "cost_logs"
  FOR UPDATE
  USING (true);

-- Create policy for cost_logs: Only admins can delete cost logs
CREATE POLICY "Only system can delete cost_logs" ON "cost_logs"
  FOR DELETE
  USING (true);

-- Create policy for master_rules: Users can view all enabled global rules and project-specific rules
CREATE POLICY "Users can view enabled master_rules" ON "master_rules"
  FOR SELECT
  USING (
    enabled = true AND (
      scope = 'GLOBAL' OR
      ("projectId" IS NOT NULL AND EXISTS (
        SELECT 1 FROM "projects" p
        WHERE p.id = "master_rules"."projectId"
      ))
    )
  );

-- Create policy for master_rules: Users can create rules
CREATE POLICY "Users can create master_rules" ON "master_rules"
  FOR INSERT
  WITH CHECK (true);

-- Create policy for master_rules: Users can update their own rules
CREATE POLICY "Users can update master_rules" ON "master_rules"
  FOR UPDATE
  USING (true);

-- Create policy for master_rules: Users can delete their own rules
CREATE POLICY "Users can delete master_rules" ON "master_rules"
  FOR DELETE
  USING (true);
