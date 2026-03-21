-- Migration: upgrade pgvector indexes from IVFFlat → HNSW
--
-- Why HNSW over IVFFlat:
--   • No pre-training step required (IVFFlat needs a VACUUM/ANALYZE after bulk load)
--   • Better recall at low ef_search values (95%+ vs ~90% for IVFFlat with lists=100)
--   • Faster build time for incremental inserts (no cluster invalidation)
--   • Supported since pgvector 0.5.0 / Postgres 14+
--
-- Parameters:
--   m=16     — number of bi-directional links per node (default 16; higher = better recall, more memory)
--   ef_construction=64 — size of the dynamic candidate list during build (higher = better recall, slower build)
--
-- These indexes are created CONCURRENTLY so they do not block reads or writes.
-- Run AFTER embedding generation is complete for best build performance.

-- Drop old IVFFlat indexes if they were created manually
DROP INDEX CONCURRENTLY IF EXISTS idx_store_embedding;
DROP INDEX CONCURRENTLY IF EXISTS idx_supplier_embedding;

-- HNSW indexes using cosine distance (matches the <=> operator in vector-matcher.ts)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_store_embedding_hnsw
  ON store_items USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_supplier_embedding_hnsw
  ON supplier_items USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
