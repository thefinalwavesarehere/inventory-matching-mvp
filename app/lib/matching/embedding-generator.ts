/**
 * Embedding Generator — optimised
 *
 * Key improvements over the previous version:
 *
 *  1. Bulk UPDATE via unnest() — replaces N individual UPDATE calls per batch
 *     with a single parameterised query using unnest($1::text[], $2::vector[]).
 *     For a batch of 100 items this is ~100× fewer round-trips.
 *
 *  2. $queryRaw / $executeRaw — replaces $queryRawUnsafe / $executeRawUnsafe.
 *     Tagged templates are safe by construction; no string interpolation.
 *
 *  3. Concurrent batches — up to CONCURRENT_BATCHES OpenAI requests in flight
 *     simultaneously, respecting the API rate limit while maximising throughput.
 *
 * Prerequisites: pgvector migration applied (20260312000000)
 */
import OpenAI from 'openai';
import { prisma } from '@/app/lib/db/prisma';
import { apiLogger } from '@/app/lib/structured-logger';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;
/** Items per OpenAI request (API max is 2048; 100 is a safe default) */
const BATCH_SIZE = 100;
/** How many OpenAI batches to run concurrently */
const CONCURRENT_BATCHES = 3;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function itemToText(item: {
  partNumber: string;
  lineCode?: string | null;
  description?: string | null;
}): string {
  const parts = [item.partNumber];
  if (item.lineCode) parts.push(item.lineCode);
  if (item.description) parts.push(item.description.slice(0, 200));
  return parts.join(' | ');
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
    dimensions: EMBEDDING_DIMENSIONS,
  });
  return response.data.map(d => d.embedding);
}

type ItemRow = { id: string; partNumber: string; lineCode: string | null; description: string | null };

/**
 * Bulk-write a batch of embeddings using a single unnest() UPDATE statement.
 * This replaces N individual UPDATE calls with one round-trip.
 */
async function bulkWriteEmbeddings(
  table: 'store_items' | 'supplier_items',
  ids: string[],
  embeddings: number[][]
): Promise<void> {
  // Build vector literals: "[0.1,0.2,...]"
  const vectors = embeddings.map(e => `[${e.join(',')}]`);

  if (table === 'store_items') {
    await prisma.$executeRaw`
      UPDATE store_items AS t
      SET embedding = v.vec::vector
      FROM unnest(${ids}::text[], ${vectors}::text[]) AS v(id, vec)
      WHERE t.id = v.id
    `;
  } else {
    await prisma.$executeRaw`
      UPDATE supplier_items AS t
      SET embedding = v.vec::vector
      FROM unnest(${ids}::text[], ${vectors}::text[]) AS v(id, vec)
      WHERE t.id = v.id
    `;
  }
}

/**
 * Process all batches for a table, running up to CONCURRENT_BATCHES in parallel.
 */
async function processTable(
  table: 'store_items' | 'supplier_items',
  items: ItemRow[],
  onProgress?: (done: number, total: number) => void
): Promise<number> {
  const total = items.length;
  let generated = 0;

  // Split into chunks
  const chunks: ItemRow[][] = [];
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    chunks.push(items.slice(i, i + BATCH_SIZE));
  }

  // Process chunks in sliding windows of CONCURRENT_BATCHES
  for (let i = 0; i < chunks.length; i += CONCURRENT_BATCHES) {
    const window = chunks.slice(i, i + CONCURRENT_BATCHES);

    await Promise.all(
      window.map(async (batch) => {
        const texts = batch.map(itemToText);
        const embeddings = await embedBatch(texts);
        const ids = batch.map(b => b.id);
        await bulkWriteEmbeddings(table, ids, embeddings);
        generated += batch.length;
        onProgress?.(generated, total);
      })
    );
  }

  return generated;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate and store embeddings for all store items in a project that lack one.
 */
export async function generateStoreEmbeddings(
  projectId: string,
  onProgress?: (done: number, total: number) => void
): Promise<{ generated: number; skipped: number }> {
  const items = await prisma.$queryRaw<ItemRow[]>`
    SELECT id, "partNumber", "lineCode", description
    FROM store_items
    WHERE "projectId" = ${projectId} AND embedding IS NULL
  `;

  apiLogger.info({ projectId, total: items.length }, '[EMBEDDINGS] Store items to embed');
  const generated = await processTable('store_items', items, onProgress);
  return { generated, skipped: 0 };
}

/**
 * Generate and store embeddings for all supplier items in a project that lack one.
 */
export async function generateSupplierEmbeddings(
  projectId: string,
  onProgress?: (done: number, total: number) => void
): Promise<{ generated: number; skipped: number }> {
  const items = await prisma.$queryRaw<ItemRow[]>`
    SELECT id, "partNumber", "lineCode", description
    FROM supplier_items
    WHERE "projectId" = ${projectId} AND embedding IS NULL
  `;

  apiLogger.info({ projectId, total: items.length }, '[EMBEDDINGS] Supplier items to embed');
  const generated = await processTable('supplier_items', items, onProgress);
  return { generated, skipped: 0 };
}
