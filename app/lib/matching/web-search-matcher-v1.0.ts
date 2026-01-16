/**
 * Web Search Matching Stage (Stage 4)
 * Uses web search to find alternate part numbers, then validates against catalog
 * Two-phase: 1) Search for interchanges, 2) Validate matches
 */

import prisma from '@/app/lib/db/prisma';
import { Prisma } from '@prisma/client';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const WEB_SEARCH_CONFIG = {
  MAX_CONFIDENCE: 0.8,
  MIN_CONFIDENCE: 0.5,
  BATCH_SIZE: 50,
  MAX_COST: 30,
  COST_PER_SEARCH: 0.03,
  COST_PER_VALIDATION: 0.01,
  MODEL: 'gpt-4o',
};

interface StoreItem {
  id: string;
  partNumber: string;
  lineCode: string | null;
  description: string | null;
}

interface SearchResult {
  manufacturer: string | null;
  oem_numbers: string[];
  interchange_numbers: string[];
  alternate_names: string[];
  confidence: number;
}

interface ValidationResult {
  is_match: boolean;
  confidence: number;
  reasoning: string;
}

/**
 * Phase 1: Search for part information and alternates
 */
async function searchForAlternates(storeItem: StoreItem): Promise<SearchResult | null> {
  const searchPrompt = `Search for automotive part cross-references:

Part Number: ${storeItem.partNumber}
Line Code: ${storeItem.lineCode || 'N/A'}
Description: ${storeItem.description || 'N/A'}

Find:
1. Manufacturer who makes this part
2. OEM part numbers this replaces
3. Interchange/equivalent part numbers from other brands
4. Common alternate names or numbers

Return JSON:
{
  "manufacturer": "string or null",
  "oem_numbers": ["array of OEM part numbers"],
  "interchange_numbers": ["array of equivalent part numbers"],
  "alternate_names": ["array"],
  "confidence": 0.0-1.0
}`;

  try {
    const response = await openai.chat.completions.create({
      model: WEB_SEARCH_CONFIG.MODEL,
      messages: [{ role: 'user', content: searchPrompt }],
      temperature: 0.3,
      max_tokens: 300,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.error('[WEB_SEARCH] No response from OpenAI');
      return null;
    }

    const result = JSON.parse(content) as SearchResult;
    return result;
  } catch (error: any) {
    console.error('[WEB_SEARCH] Search error:', error.message);
    return null;
  }
}

/**
 * Phase 2: Query supplier catalog with discovered alternates
 */
async function findSupplierMatches(
  storeItem: StoreItem,
  searchResult: SearchResult,
  projectId: string
): Promise<any[]> {
  const allPossibleNumbers = [
    storeItem.partNumber,
    ...searchResult.oem_numbers,
    ...searchResult.interchange_numbers,
  ].filter(n => n && n.length > 0);

  if (allPossibleNumbers.length === 0) {
    return [];
  }

  console.log(`[WEB_SEARCH] Searching catalog for: ${allPossibleNumbers.join(', ')}`);

  const supplierMatches = await prisma.supplierItem.findMany({
    where: {
      projectId: projectId,
      partNumber: { in: allPossibleNumbers },
    },
    select: {
      id: true,
      partNumber: true,
      lineCode: true,
      description: true,
    },
    take: 5,
  });

  return supplierMatches;
}

/**
 * Phase 3: Validate match with AI
 */
async function validateMatch(
  storeItem: StoreItem,
  supplierItem: any
): Promise<ValidationResult | null> {
  const validationPrompt = `Verify this automotive parts match:

Store Item: ${storeItem.partNumber} - ${storeItem.description || 'N/A'}
Potential Match: ${supplierItem.partNumber} - ${supplierItem.description || 'N/A'}

Are these the same part? Consider part numbers, descriptions, and typical automotive usage.

Return JSON:
{
  "is_match": true/false,
  "confidence": 0.0-0.8,
  "reasoning": "explanation"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: WEB_SEARCH_CONFIG.MODEL,
      messages: [{ role: 'user', content: validationPrompt }],
      temperature: 0.3,
      max_tokens: 150,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.error('[WEB_SEARCH] No validation response');
      return null;
    }

    const result = JSON.parse(content) as ValidationResult;
    
    // Cap confidence at MAX_CONFIDENCE
    if (result.confidence > WEB_SEARCH_CONFIG.MAX_CONFIDENCE) {
      result.confidence = WEB_SEARCH_CONFIG.MAX_CONFIDENCE;
    }
    
    return result;
  } catch (error: any) {
    console.error('[WEB_SEARCH] Validation error:', error.message);
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
  
  // Phase 1: Search for alternates
  const searchResult = await searchForAlternates(storeItem);
  cost += WEB_SEARCH_CONFIG.COST_PER_SEARCH;
  
  if (!searchResult || searchResult.confidence < 0.3) {
    console.log(`[WEB_SEARCH] Low search confidence for ${storeItem.partNumber}`);
    return { match: null, cost };
  }
  
  // Phase 2: Find supplier matches
  const supplierMatches = await findSupplierMatches(storeItem, searchResult, projectId);
  
  if (supplierMatches.length === 0) {
    console.log(`[WEB_SEARCH] No catalog matches for ${storeItem.partNumber}`);
    return { match: null, cost };
  }
  
  // Phase 3: Validate best match
  const validation = await validateMatch(storeItem, supplierMatches[0]);
  cost += WEB_SEARCH_CONFIG.COST_PER_VALIDATION;
  
  if (!validation || !validation.is_match) {
    console.log(`[WEB_SEARCH] Validation failed for ${storeItem.partNumber}`);
    return { match: null, cost };
  }
  
  // Check confidence threshold
  if (validation.confidence < WEB_SEARCH_CONFIG.MIN_CONFIDENCE) {
    console.log(`[WEB_SEARCH] Low validation confidence (${validation.confidence}) for ${storeItem.partNumber}`);
    return { match: null, cost };
  }
  
  console.log(`[WEB_SEARCH] ✓ Match: ${storeItem.partNumber} → ${supplierMatches[0].partNumber} (${(validation.confidence * 100).toFixed(0)}%)`);
  
  return {
    match: {
      storeItemId: storeItem.id,
      supplierId: supplierMatches[0].id,
      confidence: validation.confidence,
      reasoning: validation.reasoning,
      searchData: {
        manufacturer: searchResult.manufacturer,
        alternatesFound: searchResult.oem_numbers.length + searchResult.interchange_numbers.length,
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
  
  // Process sequentially (web search is expensive)
  for (const item of unmatchedItems) {
    if (totalCost >= WEB_SEARCH_CONFIG.MAX_COST) {
      console.log(`[WEB_SEARCH] ⚠️ Budget exhausted at $${totalCost.toFixed(2)}`);
      break;
    }
    
    const result = await processItem(item, projectId, totalCost);
    totalCost += result.cost;
    
    if (result.match) {
      matches.push(result.match);
    }
    
    console.log(`[WEB_SEARCH] Running cost: $${totalCost.toFixed(2)}/${WEB_SEARCH_CONFIG.MAX_COST}`);
    
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
    itemsProcessed: unmatchedItems.length,
    estimatedCost: totalCost,
  };
}
