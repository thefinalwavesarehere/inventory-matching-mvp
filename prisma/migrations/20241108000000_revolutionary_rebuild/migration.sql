-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MANAGER', 'REVIEWER', 'UPLOADER');

-- CreateEnum
CREATE TYPE "FileKind" AS ENUM ('ERIC', 'ARNOLD', 'INTERCHANGE', 'SUPPLIER', 'STORE');

-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('QUEUED', 'PARSING', 'PARSED', 'FAILED');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "TargetType" AS ENUM ('INVENTORY', 'SUPPLIER');

-- CreateEnum
CREATE TYPE "MatchMethod" AS ENUM ('INTERCHANGE', 'EXACT_NORM', 'LINE_PN', 'DESC_SIM', 'FUZZY_SUBSTRING', 'AI');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT,
    "role" "Role" NOT NULL DEFAULT 'REVIEWER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "FileKind" NOT NULL,
    "originalName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedById" TEXT,
    "status" "FileStatus" NOT NULL DEFAULT 'QUEUED',
    "parsedAt" TIMESTAMP(3),
    "rowCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_runs" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" "ImportStatus" NOT NULL DEFAULT 'RUNNING',
    "error" TEXT,
    "rowsProcessed" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "partNumber" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(10,2),
    "cost" DECIMAL(10,2),
    "totalLastUsage" INTEGER,
    "partNumberNorm" TEXT NOT NULL,
    "brand" TEXT,
    "lineCode" TEXT,
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_items" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "supplier" TEXT NOT NULL,
    "partNumber" TEXT NOT NULL,
    "partFull" TEXT,
    "description" TEXT,
    "currentCost" DECIMAL(10,2),
    "quantity" INTEGER,
    "ytdHist" INTEGER,
    "partNumberNorm" TEXT NOT NULL,
    "lineCode" TEXT,
    "brand" TEXT,
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_items" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "partNumber" TEXT NOT NULL,
    "partFull" TEXT,
    "description" TEXT,
    "currentCost" DECIMAL(10,2),
    "quantity" INTEGER,
    "rollingUsage" INTEGER,
    "partNumberNorm" TEXT NOT NULL,
    "lineCode" TEXT,
    "brand" TEXT,
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interchanges" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "oursPartNumber" TEXT NOT NULL,
    "theirsPartNumber" TEXT NOT NULL,
    "source" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interchanges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_candidates" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "storeItemId" TEXT NOT NULL,
    "targetType" "TargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "method" "MatchMethod" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "features" JSONB NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "match_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrichment_data" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "fieldValue" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enrichment_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "projectId" TEXT,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "meta" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_settings" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "autoConfirmMin" DOUBLE PRECISION NOT NULL DEFAULT 0.92,
    "reviewBandMin" DOUBLE PRECISION NOT NULL DEFAULT 0.65,
    "autoRejectMax" DOUBLE PRECISION NOT NULL DEFAULT 0.40,
    "aiEnabled" BOOLEAN NOT NULL DEFAULT false,
    "normalizationRules" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_token_idx" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "files_projectId_idx" ON "files"("projectId");

-- CreateIndex
CREATE INDEX "files_kind_idx" ON "files"("kind");

-- CreateIndex
CREATE INDEX "files_status_idx" ON "files"("status");

-- CreateIndex
CREATE INDEX "import_runs_projectId_idx" ON "import_runs"("projectId");

-- CreateIndex
CREATE INDEX "import_runs_fileId_idx" ON "import_runs"("fileId");

-- CreateIndex
CREATE INDEX "import_runs_status_idx" ON "import_runs"("status");

-- CreateIndex
CREATE INDEX "inventory_items_projectId_partNumberNorm_idx" ON "inventory_items"("projectId", "partNumberNorm");

-- CreateIndex
CREATE INDEX "inventory_items_lineCode_idx" ON "inventory_items"("lineCode");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_projectId_partNumber_key" ON "inventory_items"("projectId", "partNumber");

-- CreateIndex
CREATE INDEX "supplier_items_projectId_supplier_idx" ON "supplier_items"("projectId", "supplier");

-- CreateIndex
CREATE INDEX "supplier_items_projectId_partNumberNorm_idx" ON "supplier_items"("projectId", "partNumberNorm");

-- CreateIndex
CREATE INDEX "supplier_items_lineCode_idx" ON "supplier_items"("lineCode");

-- CreateIndex
CREATE INDEX "supplier_items_partFull_idx" ON "supplier_items"("partFull");

-- CreateIndex
CREATE INDEX "store_items_projectId_partNumberNorm_idx" ON "store_items"("projectId", "partNumberNorm");

-- CreateIndex
CREATE INDEX "store_items_lineCode_idx" ON "store_items"("lineCode");

-- CreateIndex
CREATE INDEX "store_items_partFull_idx" ON "store_items"("partFull");

-- CreateIndex
CREATE INDEX "interchanges_projectId_oursPartNumber_idx" ON "interchanges"("projectId", "oursPartNumber");

-- CreateIndex
CREATE INDEX "interchanges_projectId_theirsPartNumber_idx" ON "interchanges"("projectId", "theirsPartNumber");

-- CreateIndex
CREATE UNIQUE INDEX "interchanges_projectId_oursPartNumber_theirsPartNumber_key" ON "interchanges"("projectId", "oursPartNumber", "theirsPartNumber");

-- CreateIndex
CREATE INDEX "match_candidates_projectId_idx" ON "match_candidates"("projectId");

-- CreateIndex
CREATE INDEX "match_candidates_storeItemId_idx" ON "match_candidates"("storeItemId");

-- CreateIndex
CREATE INDEX "match_candidates_targetType_targetId_idx" ON "match_candidates"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "match_candidates_status_idx" ON "match_candidates"("status");

-- CreateIndex
CREATE INDEX "match_candidates_method_idx" ON "match_candidates"("method");

-- CreateIndex
CREATE INDEX "match_candidates_confidence_idx" ON "match_candidates"("confidence");

-- CreateIndex
CREATE INDEX "enrichment_data_matchId_idx" ON "enrichment_data"("matchId");

-- CreateIndex
CREATE INDEX "enrichment_data_fieldName_idx" ON "enrichment_data"("fieldName");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_projectId_idx" ON "audit_logs"("projectId");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entityId_idx" ON "audit_logs"("entity", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "project_settings_projectId_key" ON "project_settings"("projectId");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_runs" ADD CONSTRAINT "import_runs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_runs" ADD CONSTRAINT "import_runs_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_items" ADD CONSTRAINT "supplier_items_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_items" ADD CONSTRAINT "store_items_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interchanges" ADD CONSTRAINT "interchanges_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_candidates" ADD CONSTRAINT "match_candidates_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_candidates" ADD CONSTRAINT "match_candidates_storeItemId_fkey" FOREIGN KEY ("storeItemId") REFERENCES "store_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_candidates" ADD CONSTRAINT "match_candidates_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrichment_data" ADD CONSTRAINT "enrichment_data_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "match_candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

