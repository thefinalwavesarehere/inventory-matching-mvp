/**
 * Web Search Matching Stage (Stage 4)
 * Uses Tavily API for web searches, then GPT-4o to evaluate matches
 * Architecture: Tavily → GPT-4o → Match Decision
 * 
 * CRITICAL FIX (Jan 16, 2026):
 * - Corrected batching logic: Process micro-batches with GPT evaluation per batch
 * - Added GPT-4o evaluation (was missing completely)
 * - Fixed job completion logic to continue processing
 */

import prisma from '@/app/lib/db/prisma';
import { Prisma } from '@prisma/client';
import OpenAI from 'openai';
import { TavilyClient } from 'tavily';
import { getSupplierCatalog } from './supplier-catalog-cache';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const tavilyClient = new TavilyClient({ apiKey: process.env.TAVILY_API_KEY });

export const WEB_SEARCH_CONFIG = {
  MAX_CONFIDENCE: 0.8,
  MIN_CONFIDENCE: 0.5,
  BATCH_SIZE: 50,
  MICRO_BATCH_SIZE: 10, // Parallel Tavily searches per micro-batch
  MAX_COST: 30,
  COST_PER_SEARCH: 0.016, // Tavily advanced search (2 credits = $0.016)
  COST_PER_GPT_EVAL: 0.03, // GPT-4o evaluation per micro-batch
  MODEL: 'gpt-4o',
  TAVILY_MAX_RESULTS: 10,
  TAVILY_SEARCH_DEPTH: 'advanced',
  MIN_SEARCH_RESULTS: 2,
};

interface StoreItem {
  id: string;
  partNumber: string;
  lineCode: string | null;
  description: string | null;
  currentCost: Prisma.Decimal | null;
}

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: string; // Tavily returns score as string
  raw_content?: string;
}

interface TavilySearchResponse {
  results: TavilyResult[];
  answer?: string;
}

/**
 * Construct optimized Tavily search query
 */
function constructTavilyQuery(item: StoreItem): string {
  const parts: string[] = [];
  
  // Part number (required)
  if (item.partNumber) {
    parts.push(item.partNumber);
  }
  
  // Manufacturer/line code
  if (item.lineCode) {
    parts.push(item.lineCode);
  }
  
  // Clean description (remove noise)
  if (item.description) {
    const cleaned = item.description
      .replace(/\b(KIT|ASSY|ASSEMBLY|SET)\b/gi, '')
      .trim()
      .substring(0, 50);
    if (cleaned.length > 3) {
      parts.push(cleaned);
    }
  }
  
  // Add context
  parts.push('automotive OEM');
  
  return parts.join(' ');
}

/**
 * Check if item is matchable
 */
function isMatchable(item: StoreItem): boolean {
  // Must have part number
  if (!item.partNumber || item.partNumber.length < 2) {
    return false;
  }
  
  // Skip generic items
  const genericPatterns = /^(BOLT|NUT|WASHER|SCREW|CLIP|PIN|RIVET|STUD)\s*\d*$/i;
  if (genericPatterns.test(item.partNumber)) {
    return false;
  }
  
  // Skip if no description and no line code
  if (!item.description && !item.lineCode) {
    return false;
  }
  
  return true;
}

/**
 * Get relevant suppliers based on search results
 */
function getRelevantSuppliers(
  searchResults: Array<{ item: StoreItem; results: TavilyResult[] }>,
  supplierCatalog: any[],
  limit: number
): any[] {
  // Extract keywords from all search results
  const keywords = new Set<string>();
  
  searchResults.forEach(sr => {
    // Add part number
    if (sr.item.partNumber) {
      keywords.add(sr.item.partNumber.toLowerCase());
    }
    
    // Add line code
    if (sr.item.lineCode) {
      keywords.add(sr.item.lineCode.toLowerCase());
    }
    
    // Extract from web results
    sr.results.forEach(r => {
      const text = `${r.title} ${r.content}`.toLowerCase();
      const matches = text.match(/\b[A-Z0-9]{4,}\b/gi);
      if (matches) {
        matches.forEach(m => keywords.add(m.toLowerCase()));
      }
    });
  });
  
  // Score suppliers by keyword relevance
  const scored = supplierCatalog.map(s => {
    let score = 0;
    const supplierText = `${s.partNumber} ${s.lineCode || ''} ${s.description || ''}`.toLowerCase();
    
    keywords.forEach(keyword => {
      if (supplierText.includes(keyword)) {
        score++;
      }
    });
    
    return { supplier: s, score };
  });
  
  // Return top N
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.supplier);
}

/**
 * Evaluate micro-batch with GPT-4o
 */
async function evaluateMicroBatchWithGPT(
  searchResults: Array<{
    item: StoreItem;
    results: TavilyResult[];
    answer: string | null;
  }>,
  supplierCatalog: any[],
  projectId: string
): Promise<any[]> {
  
  // Build items context
  const itemsContext = searchResults.map((sr, idx) => {
    const webContext = sr.results.slice(0, 5).map(r => 
      `  - ${r.title}: ${r.content?.substring(0, 200) || 'N/A'}`
    ).join('\n');
    
    const tavilyAnswer = sr.answer ? `\n  Tavily Summary: ${sr.answer}` : '';
    
    return `
ITEM ${idx + 1}:
Store Part: ${sr.item.partNumber} | ${sr.item.lineCode || 'N/A'} | ${sr.item.description || 'N/A'}
Store Cost: $${sr.item.currentCost?.toNumber()?.toFixed(2) || 'N/A'}

Web Search Results:
${webContext}${tavilyAnswer}
`;
  }).join('\n---\n');
  
  // Get relevant suppliers
  const relevantSuppliers = getRelevantSuppliers(searchResults, supplierCatalog, 100);
  
  const suppliersContext = relevantSuppliers.map(s => 
    `${s.id}|${s.partNumber}|${s.lineCode || ''}|${s.description || ''}|$${s.currentCost?.toFixed(2) || 'N/A'}`
  ).join('\n');
  
  const prompt = `You are an automotive parts matching expert. Evaluate ${searchResults.length} store items against supplier catalog using web search data.

**STORE ITEMS WITH WEB RESEARCH:**
${itemsContext}

**SUPPLIER CATALOG (Top 100 relevant):**
${suppliersContext}

**TASK:**
For each store item, determine if ANY supplier item matches based on:
1. Part number similarity (exact or close variant)
2. Manufacturer alignment (line code match)
3. Description compatibility
4. Web search context (cross-references, interchanges, specifications)
5. Price reasonableness (similar price range)

**CONFIDENCE RULES:**
- 0.80: Exact part number + line code + web confirmation
- 0.70: Strong part number similarity + line code + web support
- 0.60: Part number match OR strong description + web confirmation
- 0.50: Reasonable match with web evidence
- Below 0.50: No match

**IMPORTANT:**
- Web search matches are NEVER 100% certain (max confidence: 0.80)
- Use web context to validate matches, not just part numbers
- Consider cross-references and OEM/aftermarket equivalents
- Price should be within reasonable range (±30%)

Return JSON object with "matches" array:
{
  "matches": [
    {
      "itemIndex": 0,
      "matched": true,
      "supplierId": "cmkg1n0cn25w0jr04q3cq2k8z",
      "confidence": 0.75,
      "reasoning": "Part D-30000 matches supplier, line code ABC confirmed, web shows same application"
    },
    {
      "itemIndex": 1,
      "matched": false,
      "reasoning": "No clear match found in catalog despite web results"
    }
  ]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: WEB_SEARCH_CONFIG.MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      response_format: { type: 'json_object' }
    });
    
    const content = response.choices[0].message.content;
    if (!content) {
      console.error('[WEB_SEARCH] Empty GPT response');
      return [];
    }
    
    // Parse response
    let evaluations: any[] = [];
    try {
      const parsed = JSON.parse(content);
      evaluations = parsed.matches || parsed.results || [];
    } catch (parseError) {
      console.error('[WEB_SEARCH] Failed to parse GPT response:', parseError);
      return [];
    }
    
    // Convert to match candidates
    const matchCandidates = evaluations
      .filter(e => e.matched && e.confidence >= WEB_SEARCH_CONFIG.MIN_CONFIDENCE)
      .map(e => {
        const result = searchResults[e.itemIndex];
        if (!result) {
          console.warn(`[WEB_SEARCH] Invalid itemIndex ${e.itemIndex}`);
          return null;
        }
        
        return {
          projectId,
          storeItemId: result.item.id,
          targetId: e.supplierId,
          targetType: 'SUPPLIER' as const,
          method: 'WEB_SEARCH' as const,
          matchStage: 4,
          confidence: Math.min(e.confidence, WEB_SEARCH_CONFIG.MAX_CONFIDENCE),
          status: 'PENDING' as const,
          features: {
            reasoning: e.reasoning,
            webSearchUsed: true
          }
        };
      })
      .filter(Boolean);
    
    // Log results
    matchCandidates.forEach(m => {
      const item = searchResults.find(sr => sr.item.id === m!.storeItemId)?.item;
      const confidence = Math.round(m!.confidence * 100);
      
      if (m!.confidence >= 0.75) {
        console.log(`[WEB_SEARCH] 🟢 HIGH (${confidence}%): ${item?.partNumber}`);
      } else if (m!.confidence >= 0.65) {
        console.log(`[WEB_SEARCH] 🟡 MEDIUM (${confidence}%): ${item?.partNumber}`);
      } else {
        console.log(`[WEB_SEARCH] 🟠 LOW (${confidence}%): ${item?.partNumber}`);
      }
    });
    
    // Log non-matches
    evaluations.filter(e => !e.matched).forEach(e => {
      const item = searchResults[e.itemIndex]?.item;
      console.log(`[WEB_SEARCH] ❌ No match: ${item?.partNumber}`);
    });
    
    return matchCandidates.filter(Boolean);
    
  } catch (error: any) {
    console.error('[WEB_SEARCH] GPT evaluation failed:', error.message);
    return [];
  }
}

/**
 * Main web search matching function
 */
export async function runWebSearchMatching(
  projectId: string,
  batchSize: number = WEB_SEARCH_CONFIG.BATCH_SIZE
): Promise<{ matchesFound: number; itemsProcessed: number; estimatedCost: number }> {
  
  console.log(`[WEB_SEARCH] Starting web search matching for project ${projectId}`);
  
  // Get supplier catalog (cached)
  const supplierCatalog = await getSupplierCatalog(projectId);
  console.log(`[WEB_SEARCH] Loaded ${supplierCatalog.length} suppliers from cache`);
  
  // Get unmatched items
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
      currentCost: true,
    },
    take: batchSize,
    orderBy: { id: 'asc' },
  });
  
  console.log(`[WEB_SEARCH] Found ${unmatchedItems.length} unmatched items`);
  
  if (unmatchedItems.length === 0) {
    return { matchesFound: 0, itemsProcessed: 0, estimatedCost: 0 };
  }
  
  // Pre-filter unmatchable items
  const matchableItems = unmatchedItems.filter(isMatchable);
  const filteredCount = unmatchedItems.length - matchableItems.length;
  
  if (filteredCount > 0) {
    console.log(`[WEB_SEARCH] Pre-filtered ${filteredCount} unmatchable items`);
  }
  
  if (matchableItems.length === 0) {
    return { matchesFound: 0, itemsProcessed: unmatchedItems.length, estimatedCost: 0 };
  }
  
  console.log(`[WEB_SEARCH] Processing ${matchableItems.length} matchable items`);
  
  const allMatches: any[] = [];
  let totalCost = 0;
  
  // Process in micro-batches
  for (let i = 0; i < matchableItems.length; i += WEB_SEARCH_CONFIG.MICRO_BATCH_SIZE) {
    const microBatch = matchableItems.slice(i, i + WEB_SEARCH_CONFIG.MICRO_BATCH_SIZE);
    
    console.log(`[WEB_SEARCH] === Micro-batch ${Math.floor(i / WEB_SEARCH_CONFIG.MICRO_BATCH_SIZE) + 1} ===`);
    console.log(`[WEB_SEARCH] 🔄 Processing ${microBatch.length} items...`);
    
    // STEP 1: Parallel Tavily searches
    const searchPromises = microBatch.map(async (item) => {
      try {
        const query = constructTavilyQuery(item);
        console.log(`[WEB_SEARCH] 🔍 Searching: ${item.partNumber}`);
        
        const results = await tavilyClient.search({
          query,
          max_results: WEB_SEARCH_CONFIG.TAVILY_MAX_RESULTS,
          search_depth: WEB_SEARCH_CONFIG.TAVILY_SEARCH_DEPTH as 'basic' | 'advanced',
          include_answer: true
        });
        
        return {
          item,
          results: results.results || [],
          answer: results.answer || null
        };
      } catch (error: any) {
        console.error(`[WEB_SEARCH] ❌ Search failed for ${item.partNumber}:`, error.message);
        return { item, results: [], answer: null };
      }
    });
    
    const searchResults = await Promise.all(searchPromises);
    
    // Filter valid results
    const validResults = searchResults.filter(sr => sr.results.length >= WEB_SEARCH_CONFIG.MIN_SEARCH_RESULTS);
    console.log(`[WEB_SEARCH] ✅ ${validResults.length}/${microBatch.length} items have valid search results`);
    
    if (validResults.length === 0) {
      console.log(`[WEB_SEARCH] ⚠️ No valid search results in micro-batch, skipping`);
      continue;
    }
    
    // STEP 2: GPT-4o evaluation
    const batchMatches = await evaluateMicroBatchWithGPT(
      validResults,
      supplierCatalog,
      projectId
    );
    
    allMatches.push(...batchMatches);
    
    // STEP 3: Update cost
    const tavilyCost = microBatch.length * WEB_SEARCH_CONFIG.COST_PER_SEARCH;
    const gptCost = WEB_SEARCH_CONFIG.COST_PER_GPT_EVAL;
    totalCost += tavilyCost + gptCost;
    
    console.log(`[WEB_SEARCH] 💰 Batch: ${batchMatches.length} matches, Cost: $${(tavilyCost + gptCost).toFixed(3)}`);
    console.log(`[WEB_SEARCH] Progress: ${i + microBatch.length}/${matchableItems.length}, Total Matches: ${allMatches.length}, Cost: $${totalCost.toFixed(2)}/${WEB_SEARCH_CONFIG.MAX_COST}`);
    
    // STEP 4: Check cost limit
    if (totalCost >= WEB_SEARCH_CONFIG.MAX_COST) {
      console.log(`[WEB_SEARCH] 🛑 Cost limit reached ($${totalCost.toFixed(2)})`);
      break;
    }
    
    // Rate limit between batches
    if (i + WEB_SEARCH_CONFIG.MICRO_BATCH_SIZE < matchableItems.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  // Save matches to database
  if (allMatches.length > 0) {
    await prisma.matchCandidate.createMany({
      data: allMatches,
      skipDuplicates: true,
    });
    
    console.log(`[WEB_SEARCH] ✅ Saved ${allMatches.length} matches to database`);
  }
  
  const matchRate = (allMatches.length / unmatchedItems.length) * 100;
  console.log(`[WEB_SEARCH] === COMPLETE ===`);
  console.log(`[WEB_SEARCH] Matches: ${allMatches.length}/${unmatchedItems.length} (${matchRate.toFixed(1)}%)`);
  console.log(`[WEB_SEARCH] Cost: $${totalCost.toFixed(2)}`);
  
  return {
    matchesFound: allMatches.length,
    itemsProcessed: unmatchedItems.length,
    estimatedCost: totalCost,
  };
}
