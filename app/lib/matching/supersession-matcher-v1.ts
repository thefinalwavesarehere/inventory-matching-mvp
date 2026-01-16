/**
 * Stage 3B: Supersession/Replacement Lookup
 * 
 * Finds replacement parts for discontinued items using:
 * 1. AI knowledge of common supersessions
 * 2. Web search for supersession documentation
 * 
 * Expected impact: 8-12% additional matches (discontinued parts)
 * Cost: $0.02-0.03 per item (AI + web search)
 */

import prisma from '@/app/lib/db/prisma';
import OpenAI from 'openai';
import { TavilyClient } from 'tavily';
import { getSupplierCatalog } from './supplier-catalog-cache';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const tavilyClient = new TavilyClient({ apiKey: process.env.TAVILY_API_KEY });

export const SUPERSESSION_CONFIG = {
  BATCH_SIZE: 50,
  MAX_COST: 25,
  COST_PER_AI_QUERY: 0.015, // GPT-4o
  COST_PER_WEB_SEARCH: 0.016, // Tavily advanced
  MIN_CONFIDENCE: 0.50,
  MAX_CONFIDENCE: 0.80, // Capped due to indirect match
  AI_CONFIDENCE_THRESHOLD: 0.60,
  WEB_CONFIDENCE_THRESHOLD: 0.50,
};

interface StoreItem {
  id: string;
  partNumber: string;
  lineCode: string | null;
  description: string | null;
}

interface SupplierItem {
  id: string;
  partNumber: string;
  lineCode: string | null;
  description: string | null;
}

interface SupersessionResult {
  originalPart: string;
  replacementPart: string;
  manufacturer: string;
  confidence: number;
  source: 'ai_knowledge' | 'web_search';
  reasoning?: string;
}

/**
 * Query AI for known supersessions
 */
async function queryAIForSupersession(item: StoreItem): Promise<SupersessionResult | null> {
  const prompt = `You are an automotive parts expert. Determine if this part has been superseded/replaced:

Original Part: ${item.partNumber}
Manufacturer: ${item.lineCode || 'Unknown'}
Description: ${item.description || 'N/A'}

Has this part been superseded/replaced? If yes, provide:
{
  "superseded": true,
  "replacementPart": "new part number",
  "manufacturer": "manufacturer code",
  "confidence": 0.0-1.0,
  "reasoning": "why this is the replacement"
}

If no supersession known, return:
{"superseded": false}

Only return valid JSON.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 300,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    const result = JSON.parse(content);

    if (result.superseded && result.confidence >= SUPERSESSION_CONFIG.AI_CONFIDENCE_THRESHOLD) {
      console.log(`[SUPERSESSION] AI found replacement: ${item.partNumber} → ${result.replacementPart}`);
      return {
        originalPart: item.partNumber,
        replacementPart: result.replacementPart,
        manufacturer: result.manufacturer || item.lineCode || 'Unknown',
        confidence: result.confidence,
        source: 'ai_knowledge',
        reasoning: result.reasoning,
      };
    }

    return null;
  } catch (error: any) {
    console.error('[SUPERSESSION] AI query error:', error.message);
    return null;
  }
}

/**
 * Search web for supersession documentation
 */
async function searchWebForSupersession(item: StoreItem): Promise<SupersessionResult | null> {
  const query = `${item.partNumber} ${item.lineCode || ''} superseded replaced by automotive part`.trim();

  try {
    const searchResults = await tavilyClient.search({
      query,
      max_results: 5,
      search_depth: 'advanced',
      include_domains: [
        'rockauto.com',
        'napaonline.com',
        'partsgeek.com',
        'autozone.com',
        'oreillyauto.com',
      ],
    });

    if (!searchResults || !searchResults.results || searchResults.results.length === 0) {
      return null;
    }

    // Use AI to extract supersession info from search results
    const extractionPrompt = `Extract supersession information from these search results:

Original Part: ${item.partNumber}
Manufacturer: ${item.lineCode || 'Unknown'}

Search Results:
${searchResults.results.map(r => `${r.title}: ${r.content}`).join('\n\n')}

Does any result show this part has been superseded/replaced?
Return JSON:
{
  "superseded": true/false,
  "replacementPart": "new part number" (if superseded),
  "confidence": 0.0-1.0,
  "reasoning": "evidence from search results"
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: extractionPrompt }],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 300,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    const result = JSON.parse(content);

    if (result.superseded && result.confidence >= SUPERSESSION_CONFIG.WEB_CONFIDENCE_THRESHOLD) {
      console.log(`[SUPERSESSION] Web found replacement: ${item.partNumber} → ${result.replacementPart}`);
      return {
        originalPart: item.partNumber,
        replacementPart: result.replacementPart,
        manufacturer: item.lineCode || 'Unknown',
        confidence: result.confidence,
        source: 'web_search',
        reasoning: result.reasoning,
      };
    }

    return null;
  } catch (error: any) {
    console.error('[SUPERSESSION] Web search error:', error.message);
    return null;
  }
}

/**
 * Find supersession using AI and/or web search
 */
async function findSupersession(storeItem: StoreItem): Promise<SupersessionResult | null> {
  // Strategy 1: Use AI knowledge (faster, cheaper)
  const aiSupersession = await queryAIForSupersession(storeItem);
  if (aiSupersession) return aiSupersession;

  // Strategy 2: Web search (more comprehensive, more expensive)
  const webSupersession = await searchWebForSupersession(storeItem);
  if (webSupersession) return webSupersession;

  return null;
}

/**
 * Match store item via supersession to supplier catalog
 */
function matchViaSupersession(
  storeItem: StoreItem,
  supersession: SupersessionResult,
  supplierCatalog: SupplierItem[]
): any | null {
  
  const replacementPN = supersession.replacementPart.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  const replacementMatch = supplierCatalog.find(s => {
    const supplierPN = s.partNumber.toLowerCase().replace(/[^a-z0-9]/g, '');
    const lineCodeMatch = !supersession.manufacturer || 
                          supersession.manufacturer === 'Unknown' ||
                          s.lineCode === supersession.manufacturer;
    return supplierPN === replacementPN && lineCodeMatch;
  });

  if (replacementMatch) {
    // Apply penalty for indirect match
    const confidence = Math.min(
      supersession.confidence * 0.85,
      SUPERSESSION_CONFIG.MAX_CONFIDENCE
    );

    console.log(`[SUPERSESSION] ✓ Matched: ${storeItem.partNumber} → ${supersession.replacementPart} → ${replacementMatch.partNumber}`);

    return {
      storeItemId: storeItem.id,
      supplierId: replacementMatch.id,
      confidence,
      supersession,
    };
  }

  return null;
}

/**
 * Process a single item
 */
async function processItem(
  storeItem: StoreItem,
  supplierCatalog: SupplierItem[]
): Promise<any | null> {
  
  // Find supersession
  const supersession = await findSupersession(storeItem);
  
  if (!supersession) {
    console.log(`[SUPERSESSION] No supersession found for ${storeItem.partNumber}`);
    return null;
  }

  // Match replacement part to supplier catalog
  const match = matchViaSupersession(storeItem, supersession, supplierCatalog);
  
  return match;
}

/**
 * Main supersession matching function
 */
export async function runSupersessionMatching(
  projectId: string,
  batchSize: number = SUPERSESSION_CONFIG.BATCH_SIZE
): Promise<{ matchesFound: number; itemsProcessed: number; estimatedCost: number }> {
  console.log(`[SUPERSESSION] Starting supersession matching for project ${projectId}`);

  // Get unmatched items (not matched by stages 1, 2, or 3A)
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
    orderBy: { id: 'asc' },
  });

  console.log(`[SUPERSESSION] Found ${unmatchedItems.length} unmatched items`);

  if (unmatchedItems.length === 0) {
    return { matchesFound: 0, itemsProcessed: 0, estimatedCost: 0 };
  }

  // Get supplier catalog (cached)
  const supplierCatalog = await getSupplierCatalog(projectId);
  console.log(`[SUPERSESSION] Loaded ${supplierCatalog.length} supplier items from cache`);

  const matches: any[] = [];
  let totalCost = 0;

  // Process items sequentially
  for (let i = 0; i < unmatchedItems.length; i++) {
    const item = unmatchedItems[i];

    if (totalCost >= SUPERSESSION_CONFIG.MAX_COST) {
      console.log(`[SUPERSESSION] ⚠️ Cost limit reached at $${totalCost.toFixed(2)}`);
      break;
    }

    try {
      const match = await processItem(item, supplierCatalog);

      if (match) {
        matches.push(match);
      }

      // Cost: AI query + potential web search
      totalCost += SUPERSESSION_CONFIG.COST_PER_AI_QUERY;
      if (match && match.supersession.source === 'web_search') {
        totalCost += SUPERSESSION_CONFIG.COST_PER_WEB_SEARCH;
      }

      // Rate limit: 1 second between requests
      if (i < unmatchedItems.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error: any) {
      console.error(`[SUPERSESSION] Error processing ${item.partNumber}:`, error.message);
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
        method: 'SUPERSESSION',
        confidence: m.confidence,
        status: 'PENDING',
        features: {
          originalPart: m.supersession.originalPart,
          replacementPart: m.supersession.replacementPart,
          manufacturer: m.supersession.manufacturer,
          source: m.supersession.source,
          reasoning: m.supersession.reasoning,
        },
      })),
      skipDuplicates: true,
    });

    console.log(`[SUPERSESSION] ✅ Saved ${matches.length} matches to database`);
  }

  const matchRate = (matches.length / unmatchedItems.length) * 100;
  console.log(`[SUPERSESSION] === COMPLETE ===`);
  console.log(`[SUPERSESSION] Matches: ${matches.length}/${unmatchedItems.length} (${matchRate.toFixed(1)}%)`);
  console.log(`[SUPERSESSION] Cost: $${totalCost.toFixed(2)}`);

  return {
    matchesFound: matches.length,
    itemsProcessed: unmatchedItems.length,
    estimatedCost: totalCost,
  };
}
