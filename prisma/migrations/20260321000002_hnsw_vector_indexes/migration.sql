-- Migration: HNSW vector indexes (pgvector 0.5+)
-- CONCURRENTLY removed — Prisma migrate deploy runs inside a transaction block.
-- Run after embedding generation has populated the embedding columns.

-- Drop old IVFFlat indexes if they were created manually
DROP INDEX IF EXISTS idx_store_embedding;
DROP INDEX IF EXISTS idx_supplier_embedding;

-- HNSW indexes using cosine distance (matches the <=> operator in vector-matcher.ts)
-- m=16 (bi-directional links per node), ef_construction=64 (build quality)
CREATE INDEX IF NOT EXISTS idx_store_embedding_hnsw
  ON store_items USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_supplier_embedding_hnsw
  ON supplier_items USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
