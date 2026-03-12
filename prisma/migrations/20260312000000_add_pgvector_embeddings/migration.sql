-- Enable pgvector extension (requires superuser or pg_extension privilege)
-- Run this manually if the migration fails: CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding columns to store_items and supplier_items
-- Using text-embedding-3-small dimensions (1536)
ALTER TABLE "store_items" ADD COLUMN IF NOT EXISTS "embedding" vector(1536);
ALTER TABLE "supplier_items" ADD COLUMN IF NOT EXISTS "embedding" vector(1536);

-- IVFFlat indexes for approximate nearest-neighbor search
-- NOTE: Create these AFTER populating embeddings for best performance
-- Run manually after the embedding generation job completes:
--
--   CREATE INDEX CONCURRENTLY idx_store_embedding
--     ON store_items USING ivfflat (embedding vector_cosine_ops)
--     WITH (lists = 100);
--
--   CREATE INDEX CONCURRENTLY idx_supplier_embedding
--     ON supplier_items USING ivfflat (embedding vector_cosine_ops)
--     WITH (lists = 100);
