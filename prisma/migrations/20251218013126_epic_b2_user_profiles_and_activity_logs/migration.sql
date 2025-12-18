-- Epic B2: User Accounts, Authentication & Activity Logging
-- Create UserProfile and ActivityLog tables

-- Create UserRole enum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'EDITOR', 'VIEWER');

-- Create UserProfile table (syncs with Supabase auth.users)
CREATE TABLE "user_profiles" (
    "id" TEXT NOT NULL PRIMARY KEY,  -- Must match Supabase auth.users.id
    "email" TEXT NOT NULL UNIQUE,
    "full_name" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'EDITOR',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL
);

-- Create indexes for UserProfile
CREATE INDEX "user_profiles_email_idx" ON "user_profiles"("email");
CREATE INDEX "user_profiles_role_idx" ON "user_profiles"("role");

-- Create ActivityLog table
CREATE TABLE "activity_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "project_id" TEXT,
    "user_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT "activity_logs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "activity_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Create indexes for ActivityLog
CREATE INDEX "activity_logs_user_id_idx" ON "activity_logs"("user_id");
CREATE INDEX "activity_logs_project_id_idx" ON "activity_logs"("project_id");
CREATE INDEX "activity_logs_action_idx" ON "activity_logs"("action");
CREATE INDEX "activity_logs_created_at_idx" ON "activity_logs"("created_at");

-- Note: Existing admin user in Supabase auth.users should be manually inserted into user_profiles
-- Example:
-- INSERT INTO user_profiles (id, email, full_name, role, created_at, updated_at)
-- SELECT id, email, raw_user_meta_data->>'full_name', 'ADMIN'::UserRole, created_at, updated_at
-- FROM auth.users
-- WHERE email = 'admin@example.com';
