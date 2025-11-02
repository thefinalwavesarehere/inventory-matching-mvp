-- Initial Schema Migration for Inventory Matching System
-- Run this in Supabase SQL Editor: https://app.supabase.com/project/_/sql

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Project grouping for file uploads
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT NOT NULL,
    description TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Track file uploads
CREATE TABLE IF NOT EXISTS upload_sessions (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "projectId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'completed',
    CONSTRAINT upload_sessions_projectId_fkey FOREIGN KEY ("projectId") REFERENCES projects(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS upload_sessions_projectId_idx ON upload_sessions("projectId");

-- Arnold inventory items
CREATE TABLE IF NOT EXISTS arnold_inventory (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "sessionId" TEXT NOT NULL,
    "partNumber" TEXT NOT NULL,
    "usageLast12" INTEGER,
    cost DOUBLE PRECISION,
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT arnold_inventory_sessionId_fkey FOREIGN KEY ("sessionId") REFERENCES upload_sessions(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS arnold_inventory_sessionId_idx ON arnold_inventory("sessionId");
CREATE INDEX IF NOT EXISTS arnold_inventory_partNumber_idx ON arnold_inventory("partNumber");

-- Supplier catalog items
CREATE TABLE IF NOT EXISTS supplier_catalog (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "sessionId" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL DEFAULT 'CarQuest',
    "partFull" TEXT NOT NULL,
    "lineCode" TEXT NOT NULL,
    "partNumber" TEXT NOT NULL,
    description TEXT,
    "qtyAvail" INTEGER,
    cost DOUBLE PRECISION,
    "ytdHist" INTEGER,
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT supplier_catalog_sessionId_fkey FOREIGN KEY ("sessionId") REFERENCES upload_sessions(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS supplier_catalog_sessionId_idx ON supplier_catalog("sessionId");
CREATE INDEX IF NOT EXISTS supplier_catalog_partFull_idx ON supplier_catalog("partFull");
CREATE INDEX IF NOT EXISTS supplier_catalog_lineCode_idx ON supplier_catalog("lineCode");
CREATE INDEX IF NOT EXISTS supplier_catalog_partNumber_idx ON supplier_catalog("partNumber");

-- Known interchange mappings
CREATE TABLE IF NOT EXISTS known_interchanges (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "supplierSku" TEXT NOT NULL,
    "arnoldSku" TEXT NOT NULL,
    source TEXT NOT NULL,
    confidence DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    CONSTRAINT known_interchanges_supplierSku_arnoldSku_key UNIQUE ("supplierSku", "arnoldSku")
);

CREATE INDEX IF NOT EXISTS known_interchanges_supplierSku_idx ON known_interchanges("supplierSku");
CREATE INDEX IF NOT EXISTS known_interchanges_arnoldSku_idx ON known_interchanges("arnoldSku");

-- Match results between Arnold and Supplier items
CREATE TABLE IF NOT EXISTS match_results (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "arnoldItemId" TEXT NOT NULL,
    "supplierItemId" TEXT,
    "matchStage" TEXT NOT NULL,
    "confidenceScore" DOUBLE PRECISION NOT NULL,
    "matchReasons" JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    "confirmedBy" TEXT,
    "confirmedAt" TIMESTAMP(3),
    notes TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT match_results_arnoldItemId_fkey FOREIGN KEY ("arnoldItemId") REFERENCES arnold_inventory(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT match_results_supplierItemId_fkey FOREIGN KEY ("supplierItemId") REFERENCES supplier_catalog(id) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS match_results_arnoldItemId_idx ON match_results("arnoldItemId");
CREATE INDEX IF NOT EXISTS match_results_supplierItemId_idx ON match_results("supplierItemId");
CREATE INDEX IF NOT EXISTS match_results_status_idx ON match_results(status);
CREATE INDEX IF NOT EXISTS match_results_matchStage_idx ON match_results("matchStage");

-- Data enrichment for matched parts
CREATE TABLE IF NOT EXISTS enrichment_data (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "matchId" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "fieldValue" TEXT NOT NULL,
    source TEXT NOT NULL,
    confidence DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT enrichment_data_matchId_fkey FOREIGN KEY ("matchId") REFERENCES match_results(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS enrichment_data_matchId_idx ON enrichment_data("matchId");

-- Track unmatched parts for reporting
CREATE TABLE IF NOT EXISTS unmatched_parts (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "arnoldItemId" TEXT NOT NULL,
    "attemptedMethods" TEXT[] NOT NULL,
    "lastAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    "requiresManual" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT unmatched_parts_arnoldItemId_fkey FOREIGN KEY ("arnoldItemId") REFERENCES arnold_inventory(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS unmatched_parts_arnoldItemId_idx ON unmatched_parts("arnoldItemId");
CREATE INDEX IF NOT EXISTS unmatched_parts_requiresManual_idx ON unmatched_parts("requiresManual");

-- Line code mappings (for learning and reference)
CREATE TABLE IF NOT EXISTS line_code_mappings (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "supplierLine" TEXT NOT NULL,
    "arnoldLine" TEXT NOT NULL,
    confidence DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    source TEXT NOT NULL,
    "exampleCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT line_code_mappings_supplierLine_arnoldLine_key UNIQUE ("supplierLine", "arnoldLine")
);

CREATE INDEX IF NOT EXISTS line_code_mappings_supplierLine_idx ON line_code_mappings("supplierLine");
CREATE INDEX IF NOT EXISTS line_code_mappings_arnoldLine_idx ON line_code_mappings("arnoldLine");

-- Create function to update updatedAt timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updatedAt
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_match_results_updated_at BEFORE UPDATE ON match_results
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_line_code_mappings_updated_at BEFORE UPDATE ON line_code_mappings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Verify tables were created
SELECT 
    schemaname,
    tablename,
    tableowner
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN (
    'projects',
    'upload_sessions',
    'arnold_inventory',
    'supplier_catalog',
    'known_interchanges',
    'match_results',
    'enrichment_data',
    'unmatched_parts',
    'line_code_mappings'
)
ORDER BY tablename;
