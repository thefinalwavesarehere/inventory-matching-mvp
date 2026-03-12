/**
 * Embedding Generator
 *
 * Generates text-embedding-3-small embeddings for store and supplier items.
 * Used for pgvector ANN pre-filtering before AI matching.
 *
 * Cost: ~$0.002 per 1M tokens (text-embedding-3-small)
 * Typical item text: ~20 tokens → 120K items ≈ $0.005 total
 *
 * Usage:
 *   POST /api/admin/embeddings/generate  { projectId, type: "store"|"supplier"|"both" }
 */
import OpenAI from 'openai';
import prisma from '@/app/lib/db/prisma';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;
const BATCH_SIZE = 100; // OpenAI allows up to 2048 inputs per call

/**
 * Build a text representation of an item for embedding
 */
function itemToText(item: { partNumber: string; lineCode?: string | null; description?: string | null }): string {
  const parts = [item.partNumber];
  if (item.lineCode) parts.push(item.lineCode);
  if (item.description) parts.push(item.description.slice(0, 200));
  return parts.join(' | ');
}

/**
 * Generate embeddings for a batch of texts
 */
async function embedBatch(texts: string[]): Promise<number[][]> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
    dimensions: EMBEDDING_DIMENSIONS,
  });
  return response.data.map(d => d.embedding);
}

/**
 * Generate and store embeddings for all store items in a project
 */
export async function generateStoreEmbeddings(
  projectId: string,
  onProgress?: (done: number, total: number) => void
): Promise<{ generated: number; skipped: number }> {
  const items = await prisma.storeItem.findMany({
    where: { projectId, embedding: null },
    select: { id: true, partNumber: true, lineCode: true, description: true },
  });

  let generated = 0;
  const total = items.length;

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const texts = batch.map(itemToText);
    const embeddings = await embedBatch(texts);

    // Store using raw SQL (Prisma doesn't support vector type natively)
    for (let j = 0; j < batch.length; j++) {
      const vec = `[${embeddings[j].join(',')}]`;
      await prisma.$executeRawUnsafe(
        `UPDATE "store_items" SET "embedding" = $1::vector WHERE "id" = $2`,
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
 * Generate and store embeddings for all supplier items in a project
 */
export async function generateSupplierEmbeddings(
  projectId: string,
  onProgress?: (done: number, total: number) => void
): Promise<{ generated: number; skipped: number }> {
  const items = await prisma.supplierItem.findMany({
    where: { projectId, embedding: null },
    select: { id: true, partNumber: true, lineCode: true, description: true },
  });

  let generated = 0;
  const total = items.length;

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const texts = batch.map(itemToText);
    const embeddings = await embedBatch(texts);

    for (let j = 0; j < batch.length; j++) {
      const vec = `[${embeddings[j].join(',')}]`;
      await prisma.$executeRawUnsafe(
        `UPDATE "supplier_items" SET "embedding" = $1::vector WHERE "id" = $2`,
        vec,
        batch[j].id
      );
    }

    generated += batch.length;
    onProgress?.(generated, total);
  }

  return { generated, skipped: 0 };
}
