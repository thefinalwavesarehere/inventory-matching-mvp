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
  MIN_CONFIDENCE: 0.5,
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
 * Generate part number variants for better matching
 */
function getPartNumberVariants(partNumber: string): string[] {
  const variants = [partNumber];
  
  // Strip common suffixes (C, A, R, etc.)
  if (/[A-Z]$/.test(partNumber)) {
    variants.push(partNumber.slice(0, -1));
  }
  
  // Remove dashes/spaces
  const noDashes = partNumber.replace(/[-\s]/g, '');
  if (noDashes !== partNumber) {
    variants.push(noDashes);
  }
  
  // Add dashes if none exist (try common patterns)
  if (!partNumber.includes('-') && partNumber.length > 4) {
    variants.push(partNumber.slice(0, 4) + '-' + partNumber.slice(4));
    if (partNumber.length > 6) {
      variants.push(partNumber.slice(0, 3) + '-' + partNumber.slice(3));
    }
  }
  
  return [...new Set(variants)];
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
  
  // Strategy 2: Any LINE with high part number similarity (try variants)
  const variants = getPartNumberVariants(storeItem.partNumber);
  const variantConditions = variants.map(v => 
    Prisma.sql`SIMILARITY(UPPER("partNumber"), UPPER(${v})) >= 0.5`
  );
  
  const partMatches = await prisma.$queryRaw<SupplierItem[]>`
    SELECT id, "partNumber", "lineCode", description, "currentCost"
    FROM supplier_items 
    WHERE "projectId" = ${projectId}
    AND (${Prisma.join(variantConditions, ' OR ')})
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
  
  // Build OR conditions for keywords
  const orConditions = keywords.map(k => 
    Prisma.sql`description ILIKE ${`%${k}%`}`
  );
  
  const descMatches = await prisma.$queryRaw<SupplierItem[]>`
    SELECT id, "partNumber", "lineCode", description, "currentCost"
    FROM supplier_items 
    WHERE "projectId" = ${projectId}
    AND (${Prisma.join(orConditions, ' OR ')})
    LIMIT 50
  `;
  
  console.log(`[AI_MATCHER] Strategy 3: Found ${descMatches.length} keyword matches`);
  return descMatches;
}

/**
 * Call OpenAI to evaluate candidates
 */
async function evaluateWithAI(storeItem: StoreItem, candidates: SupplierItem[]): Promise<AIMatchResult | null> {
  const prompt = `You are an expert automotive parts matcher for Arnold Motor Supply, matching store inventory against the CarQuest supplier catalog.

STORE ITEM TO MATCH:
- Part Number: ${storeItem.partNumber}
- Line Code: ${storeItem.lineCode || 'N/A'}
- Description: ${storeItem.description || 'N/A'}
- Store Cost: $${storeItem.currentCost ? storeItem.currentCost.toNumber().toFixed(2) : 'N/A'}

SUPPLIER CANDIDATES:
${candidates.map((c, i) => `${i + 1}. Part#: ${c.partNumber} | Line: ${c.lineCode || 'N/A'} | Desc: ${c.description || 'N/A'} | Cost: $${c.currentCost ? c.currentCost.toNumber().toFixed(2) : 'N/A'}`).join('\n')}

MATCHING GUIDELINES:

**STRONG MATCH indicators (confidence 0.85-0.95):**
- Identical or near-identical part numbers (ignoring prefixes/suffixes)
- Same core number with different manufacturer codes (e.g., "12066" = "ABH12066")
- Matching description keywords + similar part numbers

**MODERATE MATCH indicators (confidence 0.60-0.84):**
- Part numbers share 4+ digits in sequence
- Descriptions match but part numbers differ slightly
- Known interchange patterns (e.g., service chambers: "24SC" ↔ "GC2424")

**ACCEPTABLE MATCH indicators (confidence 0.50-0.59):**
- Part numbers share 3+ digits
- Description keywords overlap significantly
- Same product category (e.g., both filters, both gaskets)
- Price within reasonable range (<150% difference)

**REJECT indicators (confidence <0.50):**
- Part numbers completely different
- Descriptions describe different product types
- Significant price difference (>150%) without explanation

**COMMON PATTERNS:**
- "C" suffix often indicates remanufactured/Cardone parts
- Numbers like "961-305D" are Dorman-style part numbers
- "GC" prefix = Gladhand/coupling products
- "MID" prefix = Midland brake products

**EXAMPLES:**

Good Match (accept):
- Store: "12066" (BODY BOLT) → Supplier: "12066" (BODY BOLT) ✓ Confidence: 0.95
- Store: "8101569C" → Supplier: "963-017D" ✓ Confidence: 0.85 (both are door lock actuators)

Bad Match (reject):
- Store: "1R12-568" (AIR BAG) → Supplier: "10568" (A/C CONDENSER) ✗ Different products
- Store: "AC460" → Supplier: "AC470" ✗ Different part numbers, likely different applications

TASK: Evaluate each candidate and select the BEST match. If no candidate is a good match, return match_found: false.

Respond with ONLY valid JSON (no markdown, no explanation outside JSON):
{
  "match_found": true or false,
  "best_match_index": 1 to ${candidates.length} or null if no match,
  "confidence": 0.60 to 0.99,
  "match_reasoning": "One sentence explaining why this matches or why no match exists"
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

    // Strip markdown code blocks if present
    const cleanContent = content.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
    
    const result = JSON.parse(cleanContent) as AIMatchResult;
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
  let candidates = await getCandidates(storeItem, projectId);
  
  // Fallback: If no candidates found, try broader description-only search
  if (candidates.length === 0) {
    const keywords = extractKeywords(storeItem.description);
    if (keywords.length > 0) {
      const orConditions = keywords.slice(0, 3).map(k => // Use top 3 keywords
        Prisma.sql`description ILIKE ${`%${k}%`}`
      );
      
      candidates = await prisma.$queryRaw<SupplierItem[]>`
        SELECT id, "partNumber", "lineCode", description, "currentCost"
        FROM supplier_items 
        WHERE "projectId" = ${projectId}
        AND (${Prisma.join(orConditions, ' OR ')})
        LIMIT 30
      `;
      
      if (candidates.length > 0) {
        console.log(`[AI_MATCHER] Fallback found ${candidates.length} candidates for ${storeItem.partNumber}`);
      }
    }
  }
  
  if (candidates.length === 0) {
    console.log(`[AI_MATCHER] No match for ${storeItem.partNumber}: NO_CANDIDATES_FOUND`);
    return null;
  }
  
  // Evaluate with AI
  const result = await evaluateWithAI(storeItem, candidates);
  if (!result || !result.match_found || result.best_match_index === null) {
    console.log(`[AI_MATCHER] No match for ${storeItem.partNumber}: AI_REJECTED_ALL_CANDIDATES (${candidates.length} evaluated)`);
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
  batchSize: number = AI_CONFIG.BATCH_SIZE,
  offset: number = 0
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
    skip: offset,
    orderBy: { id: 'asc' },
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
        method: 'AI',
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
