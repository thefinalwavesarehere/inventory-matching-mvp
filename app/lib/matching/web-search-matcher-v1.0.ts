/**
 * Web Search Matching Stage (Stage 4)
 * Uses Tavily API for web searches, then GPT-4o to evaluate matches
 * Architecture: Tavily → GPT-4o → Match Decision
 */

import prisma from '@/app/lib/db/prisma';
import { Prisma } from '@prisma/client';
import OpenAI from 'openai';
import { TavilyClient } from 'tavily';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const tavilyClient = new TavilyClient({ apiKey: process.env.TAVILY_API_KEY });

export const WEB_SEARCH_CONFIG = {
  MAX_CONFIDENCE: 0.8,
  MIN_CONFIDENCE: 0.5,
  BATCH_SIZE: 50,
  MAX_COST: 30,
  COST_PER_SEARCH: 0.008, // Tavily basic search
  COST_PER_EVALUATION: 0.015, // GPT-4o evaluation
  MODEL: 'gpt-4o',
};

interface StoreItem {
  id: string;
  partNumber: string;
  lineCode: string | null;
  description: string | null;
}

interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

interface MatchEvaluation {
  has_match: boolean;
  supplier_id: string | null;
  confidence: number;
  reasoning: string;
}

/**
 * Phase 1: Search web using Tavily
 */
async function searchWebForPart(storeItem: StoreItem): Promise<TavilySearchResult[] | null> {
  // Construct search query
  const searchQuery = [
    storeItem.partNumber,
    storeItem.lineCode,
    storeItem.description,
    'automotive part cross reference interchange',
  ]
    .filter(Boolean)
    .join(' ');

  try {
    console.log(`[WEB_SEARCH] Tavily search: ${searchQuery}`);
    
    const response = await tavilyClient.search(searchQuery, {
      searchDepth: 'basic',
      maxResults: 5,
    });

    if (!response || !response.results || response.results.length === 0) {
      console.log('[WEB_SEARCH] No Tavily results found');
      return null;
    }

    const results: TavilySearchResult[] = response.results.map((r: any) => ({
      title: r.title || '',
      url: r.url || '',
      content: r.content || '',
      score: r.score || 0,
    }));

    console.log(`[WEB_SEARCH] Found ${results.length} web results`);
    return results;
  } catch (error: any) {
    console.error('[WEB_SEARCH] Tavily search error:', error.message);
    return null;
  }
}

/**
 * Phase 2: Get potential supplier matches
 */
async function getPotentialSupplierMatches(
  storeItem: StoreItem,
  projectId: string
): Promise<any[]> {
  // Get supplier items with similar part numbers or descriptions
  const supplierMatches = await prisma.$queryRaw<any[]>`
    SELECT 
      id,
      "partNumber",
      "lineCode",
      description,
      GREATEST(
        SIMILARITY("partNumber", ${storeItem.partNumber}),
        COALESCE(SIMILARITY(description, ${storeItem.description || ''}), 0)
      ) as similarity
    FROM supplier_items
    WHERE "projectId" = ${projectId}
      AND (
        SIMILARITY("partNumber", ${storeItem.partNumber}) > 0.3
        OR SIMILARITY(description, ${storeItem.description || ''}) > 0.2
      )
    ORDER BY similarity DESC
    LIMIT 10
  `;

  return supplierMatches;
}

/**
 * Phase 3: Use GPT-4o to evaluate web search results against supplier catalog
 */
async function evaluateMatchWithGPT(
  storeItem: StoreItem,
  webResults: TavilySearchResult[],
  supplierCandidates: any[]
): Promise<MatchEvaluation | null> {
  // Format web search results for prompt
  const webResultsSummary = webResults
    .map((r, i) => `Result ${i + 1}: ${r.title}\n${r.content.substring(0, 200)}...`)
    .join('\n\n');

  // Format supplier candidates
  const supplierList = supplierCandidates
    .map((s, i) => `[${i}] ID: ${s.id}, Part: ${s.partNumber}, Line: ${s.lineCode || 'N/A'}, Desc: ${s.description || 'N/A'}`)
    .join('\n');

  const evaluationPrompt = `You are an automotive parts matching expert. Based on web search results, determine if any supplier items match the store item.

STORE ITEM:
Part Number: ${storeItem.partNumber}
Line Code: ${storeItem.lineCode || 'N/A'}
Description: ${storeItem.description || 'N/A'}

WEB SEARCH RESULTS:
${webResultsSummary}

SUPPLIER CANDIDATES:
${supplierList}

TASK:
Analyze the web search results to find cross-references, interchange numbers, or equivalents. Then determine if any supplier candidate matches the store item.

CONFIDENCE SCORING:
- 0.80: Web results explicitly confirm parts are interchangeable/equivalent
- 0.70: Strong evidence of compatibility from multiple sources
- 0.60: Moderate evidence, same manufacturer or OEM reference
- 0.50: Weak evidence, similar specs or applications
- Below 0.50: Reject match

Return JSON only:
{
  "has_match": true/false,
  "supplier_id": "ID from supplier list or null",
  "confidence": 0.0-0.8,
  "reasoning": "brief explanation"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: WEB_SEARCH_CONFIG.MODEL,
      messages: [{ role: 'user', content: evaluationPrompt }],
      temperature: 0.3,
      max_tokens: 300,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.error('[WEB_SEARCH] No GPT-4o response');
      return null;
    }

    const result = JSON.parse(content) as MatchEvaluation;
    
    // Cap confidence at MAX_CONFIDENCE
    if (result.confidence > WEB_SEARCH_CONFIG.MAX_CONFIDENCE) {
      result.confidence = WEB_SEARCH_CONFIG.MAX_CONFIDENCE;
    }
    
    return result;
  } catch (error: any) {
    console.error('[WEB_SEARCH] GPT-4o evaluation error:', error.message);
    return null;
  }
}

/**
 * Process a single store item with web search
 */
async function processItem(
  storeItem: StoreItem,
  projectId: string,
  currentCost: number
): Promise<{ match: any | null; cost: number }> {
  let cost = 0;
  
  // Phase 1: Search web with Tavily
  const webResults = await searchWebForPart(storeItem);
  cost += WEB_SEARCH_CONFIG.COST_PER_SEARCH;
  
  if (!webResults || webResults.length === 0) {
    console.log(`[WEB_SEARCH] No web results for ${storeItem.partNumber}`);
    return { match: null, cost };
  }
  
  // Phase 2: Get potential supplier matches
  const supplierCandidates = await getPotentialSupplierMatches(storeItem, projectId);
  
  if (supplierCandidates.length === 0) {
    console.log(`[WEB_SEARCH] No supplier candidates for ${storeItem.partNumber}`);
    return { match: null, cost };
  }
  
  // Phase 3: Evaluate with GPT-4o
  const evaluation = await evaluateMatchWithGPT(storeItem, webResults, supplierCandidates);
  cost += WEB_SEARCH_CONFIG.COST_PER_EVALUATION;
  
  if (!evaluation || !evaluation.has_match || !evaluation.supplier_id) {
    console.log(`[WEB_SEARCH] No match found for ${storeItem.partNumber}`);
    return { match: null, cost };
  }
  
  // Check confidence threshold
  if (evaluation.confidence < WEB_SEARCH_CONFIG.MIN_CONFIDENCE) {
    console.log(`[WEB_SEARCH] Low confidence (${evaluation.confidence.toFixed(2)}) for ${storeItem.partNumber}`);
    return { match: null, cost };
  }
  
  console.log(`[WEB_SEARCH] ✓ Match: ${storeItem.partNumber} → Supplier ${evaluation.supplier_id} (${(evaluation.confidence * 100).toFixed(0)}%)`);
  
  return {
    match: {
      storeItemId: storeItem.id,
      supplierId: evaluation.supplier_id,
      confidence: evaluation.confidence,
      reasoning: evaluation.reasoning,
      searchData: {
        webResultsCount: webResults.length,
        candidatesEvaluated: supplierCandidates.length,
      },
    },
    cost,
  };
}

/**
 * Main web search matching function
 */
export async function runWebSearchMatching(
  projectId: string,
  batchSize: number = WEB_SEARCH_CONFIG.BATCH_SIZE
): Promise<{ matchesFound: number; itemsProcessed: number; estimatedCost: number }> {
  console.log(`[WEB_SEARCH] Starting web search matching for project ${projectId}`);
  
  // Get unmatched items (not matched by stages 1, 2, or 3)
  const unmatchedItems = await prisma.storeItem.findMany({
    where: {
      projectId: projectId,
      matchCandidates: {
        none: {
          projectId: projectId,
          matchStage: { in: [1, 2, 3] },
        },
      },
    },
    select: {
      id: true,
      partNumber: true,
      lineCode: true,
      description: true,
    },
    take: batchSize,
  });
  
  console.log(`[WEB_SEARCH] Found ${unmatchedItems.length} unmatched items`);
  
  if (unmatchedItems.length === 0) {
    return { matchesFound: 0, itemsProcessed: 0, estimatedCost: 0 };
  }
  
  const matches: any[] = [];
  let totalCost = 0;
  let itemsProcessed = 0;
  
  // Process sequentially (web search is expensive)
  for (const item of unmatchedItems) {
    if (totalCost >= WEB_SEARCH_CONFIG.MAX_COST) {
      console.log(`[WEB_SEARCH] ⚠️ Budget exhausted at $${totalCost.toFixed(2)}`);
      break;
    }
    
    const result = await processItem(item, projectId, totalCost);
    totalCost += result.cost;
    itemsProcessed++;
    
    if (result.match) {
      matches.push(result.match);
    }
    
    console.log(`[WEB_SEARCH] Progress: ${itemsProcessed}/${unmatchedItems.length}, Cost: $${totalCost.toFixed(2)}/${WEB_SEARCH_CONFIG.MAX_COST}`);
    
    // Small delay between items
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Save matches to database
  if (matches.length > 0) {
    await prisma.matchCandidate.createMany({
      data: matches.map(m => ({
        projectId: projectId,
        storeItemId: m.storeItemId,
        targetId: m.supplierId,
        targetType: 'SUPPLIER',
        matchStage: 4,
        method: 'WEB_SEARCH',
        confidence: m.confidence,
        status: 'PENDING',
        features: {
          reasoning: m.reasoning,
          searchData: m.searchData,
        },
      })),
      skipDuplicates: true,
    });
    
    console.log(`[WEB_SEARCH] ✅ Saved ${matches.length} matches to database`);
  }
  
  return {
    matchesFound: matches.length,
    itemsProcessed: itemsProcessed,
    estimatedCost: totalCost,
  };
}
