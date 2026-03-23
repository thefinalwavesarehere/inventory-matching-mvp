/**
 * AI Matching Stage - Version 3.0
 *
 * Key improvements over v1.0:
 * 1. Multi-item prompts: 6 store items per LLM call (vs 1 per call in v1.0)
 *    → 6× reduction in API calls, 6× cost reduction, same latency
 * 2. Confidence threshold raised from 0.5 → 0.75 (fewer false positives)
 * 3. Structured JSON array response (no per-item parsing ambiguity)
 * 4. Concurrent batch groups: 3 groups × 6 items = 18 items per wave
 */
import prisma from '@/app/lib/db/prisma';
import { Prisma } from '@prisma/client';
import { apiLogger } from '@/app/lib/structured-logger';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const AI_CONFIG_V3 = {
  BATCH_SIZE: 100,          // Items fetched from DB per job invocation
  ITEMS_PER_PROMPT: 6,      // Store items bundled into a single LLM call
  CONCURRENT_GROUPS: 3,     // Parallel LLM calls per wave (3 × 6 = 18 items/wave)
  DELAY_BETWEEN_WAVES: 800, // ms between waves (rate limit headroom)
  MODEL: 'gpt-4.1-mini',
  MAX_COST: 100,
  COST_PER_CALL: 0.003,     // ~$0.003 per 6-item call with gpt-4.1-mini
  MIN_CONFIDENCE: 0.75,     // Raised from 0.50 — fewer false positives
  MAX_CANDIDATES: 20,       // Candidates shown per store item in prompt
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface StoreItem {
  id: string;
  partNumber: string;
  lineCode: string | null;
  description: string | null;
  currentCost: Prisma.Decimal | null;
}

interface SupplierCandidate {
  id: string;
  partNumber: string;
  lineCode: string | null;
  description: string | null;
}

interface PromptMatchResult {
  store_index: number;        // 1-based index into the prompt's store items
  match_found: boolean;
  supplier_part_number: string | null;
  confidence: number;
  reason: string;
}

interface SavedMatch {
  storeItemId: string;
  supplierId: string;
  confidence: number;
  reasoning: string;
  candidateCount: number;
}

// ─── Candidate pre-filtering ──────────────────────────────────────────────────

async function getCandidates(
  storeItem: StoreItem,
  projectId: string,
): Promise<SupplierCandidate[]> {
  // Strategy 1: same line code + trigram similarity
  if (storeItem.lineCode) {
    const rows = await prisma.$queryRaw<SupplierCandidate[]>`
      SELECT id, "partNumber", "lineCode", description
      FROM supplier_items
      WHERE "projectId" = ${projectId}
        AND "lineCode" = ${storeItem.lineCode}
        AND SIMILARITY(UPPER("partNumber"), UPPER(${storeItem.partNumber})) >= 0.3
      ORDER BY SIMILARITY(UPPER("partNumber"), UPPER(${storeItem.partNumber})) DESC
      LIMIT ${AI_CONFIG_V3.MAX_CANDIDATES}
    `;
    if (rows.length > 0) return rows;
  }

  // Strategy 2: cross-line trigram similarity
  const rows = await prisma.$queryRaw<SupplierCandidate[]>`
    SELECT id, "partNumber", "lineCode", description
    FROM supplier_items
    WHERE "projectId" = ${projectId}
      AND SIMILARITY(UPPER("partNumber"), UPPER(${storeItem.partNumber})) >= 0.4
    ORDER BY SIMILARITY(UPPER("partNumber"), UPPER(${storeItem.partNumber})) DESC
    LIMIT ${AI_CONFIG_V3.MAX_CANDIDATES}
  `;
  if (rows.length > 0) return rows;

  // Strategy 3: description keyword fallback
  if (storeItem.description) {
    const keywords = storeItem.description
      .toUpperCase()
      .replace(/[^A-Z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3)
      .slice(0, 3);

    if (keywords.length > 0) {
      const conditions = keywords.map(k => Prisma.sql`description ILIKE ${`%${k}%`}`);
      return prisma.$queryRaw<SupplierCandidate[]>`
        SELECT id, "partNumber", "lineCode", description
        FROM supplier_items
        WHERE "projectId" = ${projectId}
          AND (${Prisma.join(conditions, ' OR ')})
        LIMIT ${AI_CONFIG_V3.MAX_CANDIDATES}
      `;
    }
  }

  return [];
}

// ─── Multi-item prompt builder ────────────────────────────────────────────────

function buildMultiItemPrompt(
  items: Array<{ store: StoreItem; candidates: SupplierCandidate[] }>,
): string {
  const itemBlocks = items
    .map(({ store, candidates }, idx) => {
      const candidateList = candidates
        .map((c, ci) => `  ${ci + 1}. ${c.partNumber}${c.description ? ` — ${c.description}` : ''}`)
        .join('\n');
      return `[Item ${idx + 1}]
Store Part: ${store.partNumber}
Description: ${store.description ?? 'N/A'}
Line Code: ${store.lineCode ?? 'N/A'}
Candidates (${candidates.length}):
${candidateList}`;
    })
    .join('\n\n');

  return `You are an expert automotive parts matcher. Evaluate each store part against its candidates.

RULES:
- Punctuation is irrelevant: ABC-123 = ABC123 = ABC.123
- Line codes may differ; focus on the core part number
- Require ≥75% confidence to declare a match
- If no candidate reaches 75% confidence, set match_found to false

${itemBlocks}

Respond with ONLY a valid JSON array, one object per item, in order:
[
  {
    "store_index": 1,
    "match_found": true or false,
    "supplier_part_number": "EXACT_PART_NUMBER" or null,
    "confidence": 0.75 to 0.99,
    "reason": "one sentence"
  },
  ...
]`;
}

// ─── Single multi-item LLM call ───────────────────────────────────────────────

async function evaluateGroup(
  group: Array<{ store: StoreItem; candidates: SupplierCandidate[] }>,
): Promise<PromptMatchResult[]> {
  const prompt = buildMultiItemPrompt(group);

  try {
    const response = await openai.chat.completions.create({
      model: AI_CONFIG_V3.MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 600,
    });

    const raw = response.choices[0]?.message?.content ?? '';
    const clean = raw.replace(/^```json\s*/m, '').replace(/\s*```$/m, '').trim();
    const parsed = JSON.parse(clean) as PromptMatchResult[];

    // Validate structure
    if (!Array.isArray(parsed)) throw new Error('Response is not an array');
    return parsed;
  } catch (err: any) {
    apiLogger.error('[AI_V3] evaluateGroup parse error:', err.message);
    // Return no-match for all items in group on failure
    return group.map((_, idx) => ({
      store_index: idx + 1,
      match_found: false,
      supplier_part_number: null,
      confidence: 0,
      reason: 'parse_error',
    }));
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function runAIMatchingV3(
  projectId: string,
  batchSize: number = AI_CONFIG_V3.BATCH_SIZE,
  offset: number = 0,
): Promise<{ matchesFound: number; itemsProcessed: number; estimatedCost: number }> {
  apiLogger.info(`[AI_V3] Starting — batch=${batchSize}, offset=${offset}`);

  // Fetch unmatched store items
  const unmatchedItems = await prisma.storeItem.findMany({
    where: {
      projectId,
      matchCandidates: {
        none: { projectId, matchStage: { in: [1, 2, 3] } },
      },
    },
    select: { id: true, partNumber: true, lineCode: true, description: true, currentCost: true },
    take: batchSize,
    skip: offset,
    orderBy: { id: 'asc' },
  });

  if (unmatchedItems.length === 0) {
    apiLogger.info('[AI_V3] No unmatched items');
    return { matchesFound: 0, itemsProcessed: 0, estimatedCost: 0 };
  }

  // Filter items with usable data
  const matchable = unmatchedItems.filter(
    item => (item.partNumber?.length ?? 0) >= 2 || (item.description?.length ?? 0) >= 3,
  );
  apiLogger.info(`[AI_V3] ${matchable.length}/${unmatchedItems.length} items matchable`);

  // Pre-fetch candidates in sequential micro-batches to avoid exhausting the
  // Prisma connection pool (limit=10). Running all 100 concurrently causes
  // P2024 (connection pool timeout) within 10 seconds.
  const CANDIDATE_CONCURRENCY = 5; // max simultaneous DB connections
  const withCandidates: Array<{ store: StoreItem; candidates: SupplierCandidate[] }> = [];
  for (let i = 0; i < matchable.length; i += CANDIDATE_CONCURRENCY) {
    const slice = matchable.slice(i, i + CANDIDATE_CONCURRENCY);
    const sliceResults = await Promise.all(
      slice.map(async store => ({
        store,
        candidates: await getCandidates(store, projectId),
      }))
    );
    withCandidates.push(...sliceResults);
  }

  // Drop items with no candidates
  const actionable = withCandidates.filter(({ candidates }) => candidates.length > 0);
  apiLogger.info(`[AI_V3] ${actionable.length} items have candidates`);

  if (actionable.length === 0) {
    return { matchesFound: 0, itemsProcessed: unmatchedItems.length, estimatedCost: 0 };
  }

  // Split into groups of ITEMS_PER_PROMPT
  const groups: Array<Array<{ store: StoreItem; candidates: SupplierCandidate[] }>> = [];
  for (let i = 0; i < actionable.length; i += AI_CONFIG_V3.ITEMS_PER_PROMPT) {
    groups.push(actionable.slice(i, i + AI_CONFIG_V3.ITEMS_PER_PROMPT));
  }

  const savedMatches: SavedMatch[] = [];
  let totalCost = 0;

  // Process groups in concurrent waves
  for (let w = 0; w < groups.length; w += AI_CONFIG_V3.CONCURRENT_GROUPS) {
    const wave = groups.slice(w, w + AI_CONFIG_V3.CONCURRENT_GROUPS);
    apiLogger.info(
      `[AI_V3] Wave ${Math.floor(w / AI_CONFIG_V3.CONCURRENT_GROUPS) + 1}: ${wave.length} groups × ${AI_CONFIG_V3.ITEMS_PER_PROMPT} items`,
    );

    const waveResults = await Promise.all(wave.map(group => evaluateGroup(group)));

    // Resolve matches
    for (let gi = 0; gi < wave.length; gi++) {
      const group = wave[gi];
      const results = waveResults[gi];

      for (const result of results) {
        if (!result.match_found || !result.supplier_part_number) continue;
        if (result.confidence < AI_CONFIG_V3.MIN_CONFIDENCE) continue;

        const storeEntry = group[result.store_index - 1];
        if (!storeEntry) continue;

        const supplier = storeEntry.candidates.find(
          c => c.partNumber === result.supplier_part_number,
        );
        if (!supplier) continue;

        savedMatches.push({
          storeItemId: storeEntry.store.id,
          supplierId: supplier.id,
          confidence: result.confidence,
          reasoning: result.reason,
          candidateCount: storeEntry.candidates.length,
        });
      }

      totalCost += AI_CONFIG_V3.COST_PER_CALL;
    }

    if (totalCost >= AI_CONFIG_V3.MAX_COST) {
      apiLogger.info('[AI_V3] Cost limit reached, stopping');
      break;
    }

    // Rate-limit pause between waves
    if (w + AI_CONFIG_V3.CONCURRENT_GROUPS < groups.length) {
      await new Promise(resolve => setTimeout(resolve, AI_CONFIG_V3.DELAY_BETWEEN_WAVES));
    }
  }

  // Persist matches
  if (savedMatches.length > 0) {
    await prisma.matchCandidate.createMany({
      data: savedMatches.map(m => ({
        projectId,
        storeItemId: m.storeItemId,
        targetId: m.supplierId,
        targetType: 'SUPPLIER' as const,
        matchStage: 3,
        method: 'AI' as const,
        confidence: m.confidence,
        status: 'PENDING' as const,
        features: {
          reasoning: m.reasoning,
          candidatesEvaluated: m.candidateCount,
          model: AI_CONFIG_V3.MODEL,
          version: 'v3.0-multi-item',
        },
      })),
      skipDuplicates: true,
    });
    apiLogger.info(`[AI_V3] ✅ Saved ${savedMatches.length} matches`);
  }

  apiLogger.info(
    `[AI_V3] Complete — ${savedMatches.length} matches, ${unmatchedItems.length} processed, $${totalCost.toFixed(3)} cost`,
  );

  return {
    matchesFound: savedMatches.length,
    itemsProcessed: unmatchedItems.length,
    estimatedCost: totalCost,
  };
}
