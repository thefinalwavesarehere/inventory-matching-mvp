/**
 * Web Search Matching Stage (Stage 4)
 * Uses Tavily API to search for part cross-references and validate matches
 * Two-phase: 1) Search for interchanges, 2) Validate matches
 */

import prisma from '@/app/lib/db/prisma';
import { Prisma } from '@prisma/client';
import { tavily } from 'tavily';

const tavilyClient = tavily({ apiKey: process.env.TAVILY_API_KEY });

export const WEB_SEARCH_CONFIG = {
  MAX_CONFIDENCE: 0.8,
  MIN_CONFIDENCE: 0.5,
  BATCH_SIZE: 50,
  MAX_COST: 30,
  COST_PER_SEARCH: 0.008, // Tavily basic search cost
  COST_PER_VALIDATION: 0.008, // Additional search for validation
};

interface StoreItem {
  id: string;
  partNumber: string;
  lineCode: string | null;
  description: string | null;
}

interface SearchResult {
  manufacturer: string | null;
  alternate_numbers: string[];
  confidence: number;
}

/**
 * Phase 1: Search for part information and alternates using Tavily
 */
async function searchForAlternates(storeItem: StoreItem): Promise<SearchResult | null> {
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
    console.log(`[WEB_SEARCH] Searching: ${searchQuery}`);
    
    const response = await tavilyClient.search(searchQuery, {
      searchDepth: 'basic',
      maxResults: 5,
    });

    if (!response || !response.results || response.results.length === 0) {
      console.log('[WEB_SEARCH] No search results found');
      return null;
    }

    // Extract part numbers from search results
    const alternateNumbers = new Set<string>();
    let manufacturer: string | null = null;

    for (const result of response.results) {
      const content = `${result.title} ${result.content}`.toLowerCase();
      
      // Extract manufacturer if mentioned
      if (!manufacturer) {
        const manufacturerPatterns = [
          /(?:made by|manufactured by|from)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
          /([A-Z][A-Z]+)\s+(?:part|brand)/i,
        ];
        for (const pattern of manufacturerPatterns) {
          const match = content.match(pattern);
          if (match) {
            manufacturer = match[1].trim();
            break;
          }
        }
      }

      // Extract part numbers (alphanumeric with hyphens, 4-20 chars)
      const partNumberPattern = /\b[A-Z0-9][-A-Z0-9]{3,19}\b/gi;
      const matches = content.match(partNumberPattern);
      if (matches) {
        matches.forEach(num => {
          const cleaned = num.trim().toUpperCase();
          // Avoid common false positives
          if (cleaned.length >= 4 && cleaned.length <= 20 && !/^(HTTP|HTTPS|WWW)/.test(cleaned)) {
            alternateNumbers.add(cleaned);
          }
        });
      }
    }

    // Calculate confidence based on result quality
    const confidence = Math.min(
      0.3 + (response.results.length * 0.1) + (alternateNumbers.size * 0.05),
      0.9
    );

    console.log(`[WEB_SEARCH] Found ${alternateNumbers.size} alternate numbers, confidence: ${confidence.toFixed(2)}`);

    return {
      manufacturer,
      alternate_numbers: Array.from(alternateNumbers),
      confidence,
    };
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
    ...searchResult.alternate_numbers,
  ].filter(n => n && n.length > 0);

  if (allPossibleNumbers.length === 0) {
    return [];
  }

  console.log(`[WEB_SEARCH] Searching catalog for: ${allPossibleNumbers.slice(0, 10).join(', ')}${allPossibleNumbers.length > 10 ? '...' : ''}`);

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
 * Phase 3: Validate match with additional search
 */
async function validateMatch(
  storeItem: StoreItem,
  supplierItem: any,
  searchResult: SearchResult
): Promise<{ confidence: number; reasoning: string } | null> {
  try {
    // Build validation query
    const validationQuery = `${storeItem.partNumber} ${supplierItem.partNumber} automotive part equivalent interchange`;
    
    console.log(`[WEB_SEARCH] Validating: ${storeItem.partNumber} vs ${supplierItem.partNumber}`);
    
    const response = await tavilyClient.search(validationQuery, {
      searchDepth: 'basic',
      maxResults: 3,
    });

    if (!response || !response.results || response.results.length === 0) {
      return {
        confidence: 0.5, // Default confidence if no validation results
        reasoning: 'Match found via alternate part numbers',
      };
    }

    // Check if both part numbers appear together in results
    let mentionsTogether = 0;
    let mentionsEither = 0;

    for (const result of response.results) {
      const content = `${result.title} ${result.content}`.toLowerCase();
      const hasStore = content.includes(storeItem.partNumber.toLowerCase());
      const hasSupplier = content.includes(supplierItem.partNumber.toLowerCase());
      
      if (hasStore && hasSupplier) {
        mentionsTogether++;
      }
      if (hasStore || hasSupplier) {
        mentionsEither++;
      }
    }

    // Calculate confidence based on validation
    let confidence = 0.5; // Base confidence
    
    if (mentionsTogether > 0) {
      confidence = Math.min(0.7 + (mentionsTogether * 0.1), WEB_SEARCH_CONFIG.MAX_CONFIDENCE);
    } else if (mentionsEither > 0) {
      confidence = 0.6;
    }

    // Factor in search result confidence
    confidence = Math.min(confidence * searchResult.confidence, WEB_SEARCH_CONFIG.MAX_CONFIDENCE);

    const reasoning = mentionsTogether > 0
      ? `Parts mentioned together in ${mentionsTogether} source(s)`
      : `Found via cross-reference search (${searchResult.alternate_numbers.length} alternates)`;

    console.log(`[WEB_SEARCH] Validation confidence: ${confidence.toFixed(2)} - ${reasoning}`);

    return { confidence, reasoning };
  } catch (error: any) {
    console.error('[WEB_SEARCH] Validation error:', error.message);
    return {
      confidence: 0.5,
      reasoning: 'Match found via alternate part numbers (validation unavailable)',
    };
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
  const validation = await validateMatch(storeItem, supplierMatches[0], searchResult);
  cost += WEB_SEARCH_CONFIG.COST_PER_VALIDATION;
  
  if (!validation) {
    console.log(`[WEB_SEARCH] Validation failed for ${storeItem.partNumber}`);
    return { match: null, cost };
  }
  
  // Check confidence threshold
  if (validation.confidence < WEB_SEARCH_CONFIG.MIN_CONFIDENCE) {
    console.log(`[WEB_SEARCH] Low validation confidence (${validation.confidence.toFixed(2)}) for ${storeItem.partNumber}`);
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
        alternatesFound: searchResult.alternate_numbers.length,
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
