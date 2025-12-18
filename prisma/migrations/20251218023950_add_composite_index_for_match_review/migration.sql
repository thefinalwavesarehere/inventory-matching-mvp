-- Add composite index for Match Review page filtering
-- This index optimizes queries that filter by projectId, status, and confidence
CREATE INDEX "match_candidates_project_id_status_confidence_idx" ON "match_candidates"("project_id", "status", "confidence");
