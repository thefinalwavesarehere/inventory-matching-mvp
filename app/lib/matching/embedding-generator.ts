/**
 * Embedding Generator
 *
 * Generates text-embedding-3-small embeddings for store and supplier items.
 * Uses raw SQL for all embedding column operations since pgvector's `vector`
 * type is not representable in the Prisma schema type system.
 *
 * Prerequisites: pgvector migration applied (20260312000000)
 */
import OpenAI from 'openai';
import prisma from '@/app/lib/db/prisma';
import { apiLogger } from '@/app/lib/structured-logger';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;
const BATCH_SIZE = 100;

function itemToText(item: { partNumber: string; lineCode?: string | null; description?: string | null }): string {
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

/**
 * Generate and store embeddings for all store items in a project that lack one
 */
export async function generateStoreEmbeddings(
  projectId: string,
  onProgress?: (done: number, total: number) => void
): Promise<{ generated: number; skipped: number }> {
  // Use raw SQL to filter by embedding IS NULL (not in Prisma type)
  const items = await prisma.$queryRawUnsafe<Array<{
    id: string; partNumber: string; lineCode: string | null; description: string | null;
  }>>(
    `SELECT id, "partNumber", "lineCode", description
     FROM store_items
     WHERE "projectId" = $1 AND embedding IS NULL`,
    projectId
  );

  let generated = 0;
  const total = items.length;
  apiLogger.info(`[EMBEDDINGS] Store: ${total} items to embed for project=${projectId}`);

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const texts = batch.map(itemToText);
    const embeddings = await embedBatch(texts);

    for (let j = 0; j < batch.length; j++) {
      const vec = `[${embeddings[j].join(',')}]`;
      await prisma.$executeRawUnsafe(
        `UPDATE store_items SET embedding = $1::vector WHERE id = $2`,
        vec,
        batch[j].id
      );
    }

    generated += batch.length;
    onProgress?.(generated, total);
  }

  return { generated, skipped: 0 };
}

/**
 * Generate and store embeddings for all supplier items in a project that lack one
 */
export async function generateSupplierEmbeddings(
  projectId: string,
  onProgress?: (done: number, total: number) => void
): Promise<{ generated: number; skipped: number }> {
  const items = await prisma.$queryRawUnsafe<Array<{
    id: string; partNumber: string; lineCode: string | null; description: string | null;
  }>>(
    `SELECT id, "partNumber", "lineCode", description
     FROM supplier_items
     WHERE "projectId" = $1 AND embedding IS NULL`,
    projectId
  );

  let generated = 0;
  const total = items.length;
  apiLogger.info(`[EMBEDDINGS] Supplier: ${total} items to embed for project=${projectId}`);

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const texts = batch.map(itemToText);
    const embeddings = await embedBatch(texts);

    for (let j = 0; j < batch.length; j++) {
      const vec = `[${embeddings[j].join(',')}]`;
      await prisma.$executeRawUnsafe(
        `UPDATE supplier_items SET embedding = $1::vector WHERE id = $2`,
        vec,
        batch[j].id
      );
    }

    generated += batch.length;
    onProgress?.(generated, total);
  }

  return { generated, skipped: 0 };
}
