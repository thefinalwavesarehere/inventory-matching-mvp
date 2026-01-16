/**
 * Stage 3A: AI-Enhanced Fuzzy Matching
 * 
 * Uses GPT-4o-mini to generate intelligent part number variations
 * that PostgreSQL fuzzy matching might have missed.
 * 
 * Expected impact: 5-10% additional matches
 * Cost: $0.002 per item (GPT-4o-mini)
 */

import prisma from '@/app/lib/db/prisma';
import OpenAI from 'openai';
import { getSupplierCatalog } from './supplier-catalog-cache';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const AI_FUZZY_CONFIG = {
  BATCH_SIZE: 100,
  MAX_COST: 20,
  COST_PER_ITEM: 0.002, // GPT-4o-mini
  MIN_CONFIDENCE: 0.60,
  MAX_CONFIDENCE: 0.75, // Lower than exact, higher than pure AI
  MODEL: 'gpt-4o-mini',
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

/**
 * Generate intelligent part number variations using AI
 */
async function generatePartNumberVariations(item: StoreItem): Promise<string[]> {
  const prompt = `Generate likely part number variations for automotive part:

Part Number: ${item.partNumber}
Manufacturer: ${item.lineCode || 'Unknown'}
Description: ${item.description || 'N/A'}

Common variations include:
- With/without hyphens: ABC-123 vs ABC123
- With/without leading zeros: 0123 vs 123
- Letter/number substitutions: O vs 0, I vs 1, S vs 5
- Suffixes: -A, -B, -R (revised), -HD (heavy duty), -C (chrome)
- Prefixes: R-, OEM-, AF- (aftermarket)
- Spacing: AB C123 vs ABC123

Return ONLY a JSON object with a "variations" array of 5-10 most likely variations:
{"variations": ["variation1", "variation2", ...]}`;

  try {
    const response = await openai.chat.completions.create({
      model: AI_FUZZY_CONFIG.MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 200,
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return [item.partNumber];

    const parsed = JSON.parse(content);
    const variations = parsed.variations || [item.partNumber];
    
    // Always include original
    if (!variations.includes(item.partNumber)) {
      variations.unshift(item.partNumber);
    }

    return variations;
  } catch (error: any) {
    console.error('[AI_FUZZY] Error generating variations:', error.message);
    return [item.partNumber];
  }
}

/**
 * Search supplier catalog for variation matches
 */
function findVariationMatch(
  variations: string[],
  supplierCatalog: SupplierItem[],
  storeItem: StoreItem
): SupplierItem | null {
  
  for (const variant of variations) {
    const variantLower = variant.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    // Try exact match first
    const exactMatch = supplierCatalog.find(s => {
      const supplierPN = s.partNumber.toLowerCase().replace(/[^a-z0-9]/g, '');
      const lineCodeMatch = !storeItem.lineCode || s.lineCode === storeItem.lineCode;
      return supplierPN === variantLower && lineCodeMatch;
    });
    
    if (exactMatch) {
      console.log(`[AI_FUZZY] Variation match: ${storeItem.partNumber} → ${variant} → ${exactMatch.partNumber}`);
      return exactMatch;
    }
  }
  
  return null;
}

/**
 * Process a single item with AI-enhanced fuzzy matching
 */
async function processItem(
  storeItem: StoreItem,
  supplierCatalog: SupplierItem[]
): Promise<any | null> {
  
  // Generate variations
  const variations = await generatePartNumberVariations(storeItem);
  console.log(`[AI_FUZZY] Generated ${variations.length} variations for ${storeItem.partNumber}`);
  
  // Search for match
  const match = findVariationMatch(variations, supplierCatalog, storeItem);
  
  if (!match) {
    console.log(`[AI_FUZZY] No match for ${storeItem.partNumber}`);
    return null;
  }
  
  // Calculate confidence based on variation distance
  const originalIndex = variations.indexOf(storeItem.partNumber);
  const matchedVariation = variations.find(v => {
    const vLower = v.toLowerCase().replace(/[^a-z0-9]/g, '');
    const mLower = match.partNumber.toLowerCase().replace(/[^a-z0-9]/g, '');
    return vLower === mLower;
  });
  
  const matchedIndex = matchedVariation ? variations.indexOf(matchedVariation) : variations.length - 1;
  const distance = Math.abs(matchedIndex - originalIndex);
  
  // Closer variations = higher confidence
  const confidence = Math.max(
    AI_FUZZY_CONFIG.MIN_CONFIDENCE,
    AI_FUZZY_CONFIG.MAX_CONFIDENCE - (distance * 0.05)
  );
  
  return {
    storeItemId: storeItem.id,
    supplierId: match.id,
    confidence,
    variations: variations.slice(0, 5), // Store first 5 for reference
    matchedVariation: matchedVariation || match.partNumber,
  };
}

/**
 * Main AI-enhanced fuzzy matching function
 */
export async function runAIEnhancedFuzzyMatching(
  projectId: string,
  batchSize: number = AI_FUZZY_CONFIG.BATCH_SIZE
): Promise<{ matchesFound: number; itemsProcessed: number; estimatedCost: number }> {
  console.log(`[AI_FUZZY] Starting AI-enhanced fuzzy matching for project ${projectId}`);
  
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
    },
    take: batchSize,
    orderBy: { id: 'asc' },
  });
  
  console.log(`[AI_FUZZY] Found ${unmatchedItems.length} unmatched items`);
  
  if (unmatchedItems.length === 0) {
    return { matchesFound: 0, itemsProcessed: 0, estimatedCost: 0 };
  }
  
  // Get supplier catalog (cached)
  const supplierCatalog = await getSupplierCatalog(projectId);
  console.log(`[AI_FUZZY] Loaded ${supplierCatalog.length} supplier items from cache`);
  
  const matches: any[] = [];
  let totalCost = 0;
  
  // Process items sequentially (rate limiting)
  for (let i = 0; i < unmatchedItems.length; i++) {
    const item = unmatchedItems[i];
    
    if (totalCost >= AI_FUZZY_CONFIG.MAX_COST) {
      console.log(`[AI_FUZZY] ⚠️ Cost limit reached at $${totalCost.toFixed(2)}`);
      break;
    }
    
    try {
      const match = await processItem(item, supplierCatalog);
      
      if (match) {
        matches.push(match);
      }
      
      totalCost += AI_FUZZY_CONFIG.COST_PER_ITEM;
      
      // Rate limit: 500ms between requests
      if (i < unmatchedItems.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error: any) {
      console.error(`[AI_FUZZY] Error processing ${item.partNumber}:`, error.message);
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
        method: 'FUZZY',
        confidence: m.confidence,
        status: 'PENDING',
        features: {
          variations: m.variations,
          matchedVariation: m.matchedVariation,
        },
      })),
      skipDuplicates: true,
    });
    
    console.log(`[AI_FUZZY] ✅ Saved ${matches.length} matches to database`);
  }
  
  const matchRate = (matches.length / unmatchedItems.length) * 100;
  console.log(`[AI_FUZZY] === COMPLETE ===`);
  console.log(`[AI_FUZZY] Matches: ${matches.length}/${unmatchedItems.length} (${matchRate.toFixed(1)}%)`);
  console.log(`[AI_FUZZY] Cost: $${totalCost.toFixed(2)}`);
  
  return {
    matchesFound: matches.length,
    itemsProcessed: unmatchedItems.length,
    estimatedCost: totalCost,
  };
}
