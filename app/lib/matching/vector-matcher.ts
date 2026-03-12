/**
 * Vector Similarity Matcher
 *
 * Uses pgvector cosine similarity to find the top-K most semantically similar
 * supplier items for each unmatched store item. This pre-filters candidates
 * before the AI matching stage, reducing LLM calls by 60–80%.
 *
 * Pipeline position: Between fuzzy matching (stage 2) and AI matching (stage 3)
 *
 * Prerequisites:
 *   1. pgvector extension enabled (migration 20260312000000)
 *   2. Embeddings generated for both store and supplier items
 *   3. IVFFlat indexes created on both tables
 */
import OpenAI from 'openai';
import prisma from '@/app/lib/db/prisma';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;
const TOP_K = 10;                   // Candidates per store item sent to AI
const SIMILARITY_THRESHOLD = 0.75;  // Minimum cosine similarity to consider

interface VectorCandidate {
  storeItemId: string;
  supplierItemId: string;
  similarity: number;
  storePartNumber: string;
  supplierPartNumber: string;
  storeDescription: string | null;
  supplierDescription: string | null;
}

function itemToText(item: { partNumber: string; lineCode?: string | null; description?: string | null }): string {
  const parts = [item.partNumber];
  if (item.lineCode) parts.push(item.lineCode);
  if (item.description) parts.push(item.description.slice(0, 200));
  return parts.join(' | ');
}

/**
 * Check if pgvector is available and embeddings exist for a project
 */
export async function isVectorMatchingAvailable(projectId: string): Promise<boolean> {
  try {
    const result = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM "store_items"
      WHERE "projectId" = ${projectId} AND "embedding" IS NOT NULL
      LIMIT 1
    `;
    return Number(result[0]?.count ?? 0) > 0;
  } catch {
    return false;
  }
}

/**
 * Find top-K vector-similar supplier candidates for a batch of store items
 */
export async function findVectorCandidates(
  projectId: string,
  storeItems: Array<{ id: string; partNumber: string; lineCode?: string | null; description?: string | null }>,
  topK: number = TOP_K
): Promise<VectorCandidate[]> {
  if (storeItems.length === 0) return [];

  // Generate query embeddings
  const texts = storeItems.map(itemToText);
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
    dimensions: EMBEDDING_DIMENSIONS,
  });

  const allCandidates: VectorCandidate[] = [];

  for (let i = 0; i < storeItems.length; i++) {
    const storeItem = storeItems[i];
    const queryVec = `[${response.data[i].embedding.join(',')}]`;

    const candidates = await prisma.$queryRawUnsafe<Array<{
      supplier_id: string;
      supplier_part: string;
      supplier_desc: string | null;
      similarity: number;
    }>>(
      `
      SELECT
        s."id" as supplier_id,
        s."partNumber" as supplier_part,
        s."description" as supplier_desc,
        1 - (s."embedding" <=> $1::vector) as similarity
      FROM "supplier_items" s
      WHERE s."projectId" = $2
        AND s."embedding" IS NOT NULL
        AND 1 - (s."embedding" <=> $1::vector) >= $3
      ORDER BY s."embedding" <=> $1::vector
      LIMIT $4
      `,
      queryVec,
      projectId,
      SIMILARITY_THRESHOLD,
      topK
    );

    for (const c of candidates) {
      allCandidates.push({
        storeItemId: storeItem.id,
        supplierItemId: c.supplier_id,
        similarity: c.similarity,
        storePartNumber: storeItem.partNumber,
        supplierPartNumber: c.supplier_part,
        storeDescription: storeItem.description ?? null,
        supplierDescription: c.supplier_desc,
      });
    }
  }

  return allCandidates;
}
