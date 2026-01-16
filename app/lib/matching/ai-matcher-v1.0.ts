/**
 * AI Matching Stage (Stage 3)
 * Uses GPT-4o to match store items with supplier catalog
 * Includes smart pre-filtering to reduce API costs
 */

import prisma from '@/app/lib/db/prisma';
import { Prisma } from '@prisma/client';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const AI_CONFIG = {
  BATCH_SIZE: 100,
  CONCURRENT_CALLS: 10,
  DELAY_BETWEEN_BATCHES: 1000,
  MODEL: 'gpt-4o',
  MAX_COST: 100,
  COST_PER_ITEM: 0.015,
  MIN_CONFIDENCE: 0.6,
};

interface StoreItem {
  id: string;
  partNumber: string;
  lineCode: string | null;
  description: string | null;
  currentCost: Prisma.Decimal | null;
}

interface SupplierItem {
  id: string;
  partNumber: string;
  lineCode: string | null;
  description: string | null;
  currentCost: Prisma.Decimal | null;
}

interface AIMatchResult {
  match_found: boolean;
  best_match_index: number | null;
  confidence: number;
  match_reasoning: string;
}

/**
 * Extract keywords from description for fallback search
 */
function extractKeywords(description: string | null): string[] {
  if (!description) return [];
  
  const stopWords = ['THE', 'A', 'AN', 'AND', 'OR', 'FOR', 'WITH', 'TO', 'IN', 'ON', 'AT'];
  const words = description
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.includes(w));
  
  return words.slice(0, 5); // Top 5 keywords
}

/**
 * Smart candidate pre-filtering
 * Returns up to 20-30 best candidates using 3 strategies
 */
async function getCandidates(storeItem: StoreItem, projectId: string): Promise<SupplierItem[]> {
  // Strategy 1: Same LINE code + fuzzy part number (BEST)
  if (storeItem.lineCode) {
    const sameLineMatches = await prisma.$queryRaw<SupplierItem[]>`
      SELECT id, "partNumber", "lineCode", description, "currentCost"
      FROM supplier_items 
      WHERE "projectId" = ${projectId}
      AND "lineCode" = ${storeItem.lineCode}
      AND SIMILARITY(UPPER("partNumber"), UPPER(${storeItem.partNumber})) >= 0.3
      ORDER BY SIMILARITY(UPPER("partNumber"), UPPER(${storeItem.partNumber})) DESC
      LIMIT 20
    `;
    
    if (sameLineMatches.length > 0) {
      console.log(`[AI_MATCHER] Strategy 1: Found ${sameLineMatches.length} same-line matches`);
      return sameLineMatches;
    }
  }
  
  // Strategy 2: Any LINE with high part number similarity
  const partMatches = await prisma.$queryRaw<SupplierItem[]>`
    SELECT id, "partNumber", "lineCode", description, "currentCost"
    FROM supplier_items 
    WHERE "projectId" = ${projectId}
    AND SIMILARITY(UPPER("partNumber"), UPPER(${storeItem.partNumber})) >= 0.5
    ORDER BY SIMILARITY(UPPER("partNumber"), UPPER(${storeItem.partNumber})) DESC
    LIMIT 20
  `;
  
  if (partMatches.length > 0) {
    console.log(`[AI_MATCHER] Strategy 2: Found ${partMatches.length} part-number matches`);
    return partMatches;
  }
  
  // Strategy 3: Description keyword overlap (last resort)
  const keywords = extractKeywords(storeItem.description);
  if (keywords.length === 0) {
    console.log(`[AI_MATCHER] Strategy 3: No keywords, skipping item`);
    return [];
  }
  
  const keywordConditions = keywords.map(k => `description ILIKE '%${k}%'`).join(' OR ');
  
  const descMatches = await prisma.$queryRaw<SupplierItem[]>`
    SELECT id, "partNumber", "lineCode", description, "currentCost"
    FROM supplier_items 
    WHERE "projectId" = ${projectId}
    AND (${keywordConditions})
    LIMIT 30
  `;
  
  console.log(`[AI_MATCHER] Strategy 3: Found ${descMatches.length} keyword matches`);
  return descMatches;
}

/**
 * Call OpenAI to evaluate candidates
 */
async function evaluateWithAI(storeItem: StoreItem, candidates: SupplierItem[]): Promise<AIMatchResult | null> {
  const prompt = `You are an automotive parts matching expert for an auto parts store.

STORE ITEM (what we currently stock):
- Part Number: ${storeItem.partNumber}
- Line Code: ${storeItem.lineCode || 'N/A'}
- Description: ${storeItem.description || 'N/A'}
- Our Cost: $${storeItem.currentCost ? storeItem.currentCost.toNumber().toFixed(2) : 'N/A'}

SUPPLIER CANDIDATES (potential matches from CarQuest catalog):
${candidates.map((c, i) => `
${i + 1}. Part#: ${c.partNumber} | Line: ${c.lineCode || 'N/A'} | Desc: ${c.description || 'N/A'} | Cost: $${c.currentCost ? c.currentCost.toNumber().toFixed(2) : 'N/A'}
`).join('')}

MATCHING RULES:
1. Part numbers often have different prefixes but same core number (e.g., "FEL1003" vs "1003")
2. Line codes may differ between distributors (store uses internal codes, supplier uses manufacturer codes)
3. Descriptions use abbreviations: GSKT=gasket, CTRL=control, JNT=joint, ARM=arm, HD=heavy duty
4. Price differences up to 50% are normal between distributors
5. Same part may have different levels of detail in description

EVALUATE each candidate and select the BEST match (if any exists).

Respond ONLY with valid JSON:
{
  "match_found": true/false,
  "best_match_index": 1-${candidates.length} or null,
  "confidence": 0.0-1.0,
  "match_reasoning": "brief explanation of why this matches or why no match exists"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: AI_CONFIG.MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 200,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.error('[AI_MATCHER] No response from OpenAI');
      return null;
    }

    const result = JSON.parse(content) as AIMatchResult;
    return result;
  } catch (error: any) {
    console.error('[AI_MATCHER] OpenAI error:', error.message);
    return null;
  }
}

/**
 * Process a single store item with AI matching
 */
async function processItem(storeItem: StoreItem, projectId: string): Promise<any | null> {
  const startTime = Date.now();
  
  // Get candidates
  const candidates = await getCandidates(storeItem, projectId);
  if (candidates.length === 0) {
    console.log(`[AI_MATCHER] No candidates for ${storeItem.partNumber}`);
    return null;
  }
  
  // Evaluate with AI
  const result = await evaluateWithAI(storeItem, candidates);
  if (!result || !result.match_found || result.best_match_index === null) {
    console.log(`[AI_MATCHER] No match found for ${storeItem.partNumber}`);
    return null;
  }
  
  // Check confidence threshold
  if (result.confidence < AI_CONFIG.MIN_CONFIDENCE) {
    console.log(`[AI_MATCHER] Low confidence (${result.confidence}) for ${storeItem.partNumber}`);
    return null;
  }
  
  const matchedCandidate = candidates[result.best_match_index - 1];
  if (!matchedCandidate) {
    console.error('[AI_MATCHER] Invalid match index:', result.best_match_index);
    return null;
  }
  
  const duration = Date.now() - startTime;
  console.log(`[AI_MATCHER] ✓ Match: ${storeItem.partNumber} → ${matchedCandidate.partNumber} (${(result.confidence * 100).toFixed(0)}%) in ${duration}ms`);
  
  return {
    storeItemId: storeItem.id,
    supplierId: matchedCandidate.id,
    confidence: result.confidence,
    reasoning: result.match_reasoning,
    candidateCount: candidates.length,
    duration,
  };
}

/**
 * Main AI matching function
 * Processes items in batches with rate limiting and cost tracking
 */
export async function runAIMatching(
  projectId: string,
  batchSize: number = AI_CONFIG.BATCH_SIZE
): Promise<{ matchesFound: number; itemsProcessed: number; estimatedCost: number }> {
  console.log(`[AI_MATCHER] Starting AI matching for project ${projectId}`);
  
  // Get unmatched items (not matched by stages 1 or 2)
  const unmatchedItems = await prisma.storeItem.findMany({
    where: {
      projectId: projectId,
      matchCandidates: {
        none: {
          projectId: projectId,
          matchStage: { in: [1, 2] },
        },
      },
    },
    select: {
      id: true,
      partNumber: true,
      lineCode: true,
      description: true,
      currentCost: true,
    },
    take: batchSize,
  });
  
  console.log(`[AI_MATCHER] Found ${unmatchedItems.length} unmatched items`);
  
  if (unmatchedItems.length === 0) {
    return { matchesFound: 0, itemsProcessed: 0, estimatedCost: 0 };
  }
  
  const matches: any[] = [];
  let totalCost = 0;
  
  // Process in concurrent batches
  for (let i = 0; i < unmatchedItems.length; i += AI_CONFIG.CONCURRENT_CALLS) {
    const batch = unmatchedItems.slice(i, i + AI_CONFIG.CONCURRENT_CALLS);
    
    console.log(`[AI_MATCHER] Processing batch ${Math.floor(i / AI_CONFIG.CONCURRENT_CALLS) + 1} (${batch.length} items)`);
    
    const results = await Promise.all(
      batch.map(item => 
        processItem(item, projectId).catch(err => {
          console.error(`[AI_MATCHER] Error for ${item.partNumber}:`, err.message);
          return null;
        })
      )
    );
    
    // Collect valid matches
    const validMatches = results.filter(r => r !== null);
    matches.push(...validMatches);
    
    // Update cost estimate
    totalCost += batch.length * AI_CONFIG.COST_PER_ITEM;
    console.log(`[AI_MATCHER] Running cost: $${totalCost.toFixed(2)}/${AI_CONFIG.MAX_COST}`);
    
    // Cost check
    if (totalCost >= AI_CONFIG.MAX_COST) {
      console.log('[AI_MATCHER] ⚠️ Cost limit reached, stopping');
      break;
    }
    
    // Rate limit between batches
    if (i + AI_CONFIG.CONCURRENT_CALLS < unmatchedItems.length) {
      await new Promise(resolve => setTimeout(resolve, AI_CONFIG.DELAY_BETWEEN_BATCHES));
    }
  }
  
  // Save matches to database
  if (matches.length > 0) {
    await prisma.matchCandidate.createMany({
      data: matches.map(m => ({
        projectId: projectId,
        storeItemId: m.storeItemId,
        targetId: m.supplierId,
        targetType: 'SUPPLIER',
        matchStage: 3,
        method: 'AI_GPT4',
        confidence: m.confidence,
        status: 'PENDING',
        features: {
          reasoning: m.reasoning,
          candidatesEvaluated: m.candidateCount,
          processingTimeMs: m.duration,
        },
      })),
      skipDuplicates: true,
    });
    
    console.log(`[AI_MATCHER] ✅ Saved ${matches.length} matches to database`);
  }
  
  return {
    matchesFound: matches.length,
    itemsProcessed: unmatchedItems.length,
    estimatedCost: totalCost,
  };
}
