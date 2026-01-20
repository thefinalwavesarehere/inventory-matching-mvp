-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "budgetLimit" DECIMAL(10,2),
ADD COLUMN     "currentSpend" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "cost_logs" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "cost" DECIMAL(10,4) NOT NULL,
    "itemsProcessed" INTEGER NOT NULL,
    "tokensUsed" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cost_logs_projectId_idx" ON "cost_logs"("projectId");

-- CreateIndex
CREATE INDEX "cost_logs_operation_idx" ON "cost_logs"("operation");

-- CreateIndex
CREATE INDEX "cost_logs_createdAt_idx" ON "cost_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "cost_logs" ADD CONSTRAINT "cost_logs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
