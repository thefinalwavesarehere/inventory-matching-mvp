/**
 * Stage 3C: Enhanced AI Matching v2.0
 * 
 * Multi-strategy approach with intelligent candidate selection:
 * 1. Exact part strategy (with description validation)
 * 2. Cross-reference strategy (OEM/aftermarket equivalents)
 * 3. Descriptive matching (when part numbers differ)
 * 4. Universal parts strategy (standard/generic items)
 * 
 * Expected impact: 40-50% match rate (up from 17-30%)
 * Cost: $0.015-0.02 per item
 */

import prisma from '@/app/lib/db/prisma';
import OpenAI from 'openai';
import { getSupplierCatalog } from './supplier-catalog-cache';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const AI_CONFIG_V2 = {
  BATCH_SIZE: 100,
  MAX_COST: 30,
  COST_PER_ITEM: 0.018,
  MIN_CONFIDENCE: 0.50,
  MAX_CONFIDENCE: 0.95,
  MODEL: 'gpt-4o',
  MINI_MODEL: 'gpt-4o-mini',
  CANDIDATE_LIMIT: 100,
  MIN_CANDIDATE_SCORE: 10,
};

interface StoreItem {
  id: string;
  partNumber: string;
  lineCode: string | null;
  description: string | null;
  currentCost?: number | null;
}

interface SupplierItem {
  id: string;
  partNumber: string;
  lineCode: string | null;
  description: string | null;
  currentCost?: number | null;
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
      }
    }
  }
  return matrix[b.length][a.length];
}

function calculateCandidateScore(store: StoreItem, supplier: SupplierItem): number {
  let score = 0;
  if (store.lineCode && supplier.lineCode === store.lineCode) score += 100;
  if (store.partNumber && supplier.partNumber) {
    const storePN = store.partNumber.toLowerCase().replace(/[^a-z0-9]/g, '');
    const supplierPN = supplier.partNumber.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (supplierPN.includes(storePN) || storePN.includes(supplierPN)) score += 50;
    const distance = levenshteinDistance(storePN, supplierPN);
    const similarity = 1 - distance / Math.max(storePN.length, supplierPN.length);
    score += similarity * 40;
  }
  if (store.description && supplier.description) {
    const storeWords = new Set(store.description.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    const supplierWords = supplier.description.toLowerCase().split(/\s+/);
    const matches = supplierWords.filter(w => storeWords.has(w));
    score += matches.length * 5;
  }
  if (store.currentCost && supplier.currentCost) {
    const priceDiff = Math.abs(store.currentCost - supplier.currentCost);
    if (priceDiff < 5) score += 20;
    else if (priceDiff < 20) score += 10;
  }
  return score;
}

function selectBestCandidates(storeItem: StoreItem, catalog: SupplierItem[], limit: number): SupplierItem[] {
  const scored = catalog.map(supplier => ({ supplier, score: calculateCandidateScore(storeItem, supplier) }))
    .filter(s => s.score > AI_CONFIG_V2.MIN_CANDIDATE_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return scored.map(s => s.supplier);
}

async function evaluateExactPartStrategy(storeItem: StoreItem, candidates: SupplierItem[]): Promise<any | null> {
  const storePN = storeItem.partNumber.toLowerCase().replace(/[^a-z0-9]/g, '');
  const exactMatches = candidates.filter(c => {
    const supplierPN = c.partNumber.toLowerCase().replace(/[^a-z0-9]/g, '');
    return storePN === supplierPN;
  });
  if (exactMatches.length === 0) return null;
  const prompt = `Validate if these parts match:\n\nStore Item: ${storeItem.partNumber} - ${storeItem.description || 'N/A'}\n\nSupplier Candidates:\n${exactMatches.map((c, i) => `${i + 1}. ${c.partNumber} - ${c.description || 'N/A'}`).join('\n')}\n\nPart numbers are identical. Do descriptions confirm they're the same part?\nReturn JSON: {"matches": true/false, "bestMatch": 1-${exactMatches.length} or null, "confidence": 0.0-1.0}`;
  try {
    const response = await openai.chat.completions.create({
      model: AI_CONFIG_V2.MINI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 150,
    });
    const content = response.choices[0]?.message?.content;
    if (!content) return null;
    const result = JSON.parse(content);
    if (result.matches && result.bestMatch) {
      const match = exactMatches[result.bestMatch - 1];
      console.log(`[AI_V2] Exact match: ${storeItem.partNumber} → ${match.partNumber}`);
      return { storeItemId: storeItem.id, supplierId: match.id, confidence: Math.min(result.confidence * 0.95, AI_CONFIG_V2.MAX_CONFIDENCE), strategy: 'exact_part' };
    }
  } catch (error: any) {
    console.error('[AI_V2] Exact strategy error:', error.message);
  }
  return null;
}

async function evaluateCrossReferenceStrategy(storeItem: StoreItem, candidates: SupplierItem[]): Promise<any | null> {
  const topCandidates = candidates.slice(0, 20);
  const prompt = `You are an automotive parts cross-reference expert.\n\nStore Item:\nPart: ${storeItem.partNumber}\nManufacturer: ${storeItem.lineCode || 'Unknown'}\nDescription: ${storeItem.description || 'N/A'}\n\nSupplier Candidates:\n${topCandidates.map((c, i) => `${i + 1}. ${c.partNumber} | ${c.lineCode || '?'} | ${c.description || 'N/A'}`).join('\n')}\n\nTask: Find OEM/aftermarket equivalents or cross-references.\nReturn JSON: {\n  "hasMatch": true/false,\n  "matchIndex": 1-20 or null,\n  "confidence": 0.0-1.0,\n  "matchType": "OEM_equivalent|aftermarket|direct_cross_ref|interchange",\n  "reasoning": "why this is a match"\n}`;
  try {
    const response = await openai.chat.completions.create({
      model: AI_CONFIG_V2.MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 300,
    });
    const content = response.choices[0]?.message?.content;
    if (!content) return null;
    const result = JSON.parse(content);
    if (result.hasMatch && result.confidence >= 0.6) {
      const match = topCandidates[result.matchIndex - 1];
      console.log(`[AI_V2] Cross-ref match: ${storeItem.partNumber} → ${match.partNumber} (${result.matchType})`);
      return { storeItemId: storeItem.id, supplierId: match.id, confidence: result.confidence * 0.85, strategy: 'cross_reference', matchType: result.matchType, reasoning: result.reasoning };
    }
  } catch (error: any) {
    console.error('[AI_V2] Cross-ref strategy error:', error.message);
  }
  return null;
}

async function evaluateDescriptiveMatchStrategy(storeItem: StoreItem, candidates: SupplierItem[]): Promise<any | null> {
  if (!storeItem.description || storeItem.description.split(' ').length < 3) return null;
  const storeWords = new Set(storeItem.description.toLowerCase().split(/\s+/));
  const descriptiveCandidates = candidates.filter(c => {
    if (!c.description) return false;
    const supplierWords = c.description.toLowerCase().split(/\s+/);
    const overlap = supplierWords.filter(w => storeWords.has(w)).length;
    return overlap >= 2;
  }).slice(0, 15);
  if (descriptiveCandidates.length === 0) return null;
  const prompt = `Match by description when part numbers differ:\n\nStore Item: ${storeItem.partNumber} - ${storeItem.description}\n\nCandidates with similar descriptions:\n${descriptiveCandidates.map((c, i) => `${i + 1}. ${c.partNumber} - ${c.description}`).join('\n')}\n\nCould any candidate be the same physical part despite different part numbers?\n(e.g., different manufacturer numbering, private label, rebranding)\n\nReturn JSON: {"hasMatch": true/false, "matchIndex": 1-15 or null, "confidence": 0.0-0.7, "reasoning": "..."}\n\nNOTE: Confidence should be lower (max 0.7) since part numbers don't match.`;
  try {
    const response = await openai.chat.completions.create({
      model: AI_CONFIG_V2.MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 300,
    });
    const content = response.choices[0]?.message?.content;
    if (!content) return null;
    const result = JSON.parse(content);
    if (result.hasMatch && result.confidence >= 0.5) {
      const match = descriptiveCandidates[result.matchIndex - 1];
      console.log(`[AI_V2] Descriptive match: ${storeItem.partNumber} → ${match.partNumber}`);
      return { storeItemId: storeItem.id, supplierId: match.id, confidence: Math.min(result.confidence, 0.7), strategy: 'descriptive', reasoning: result.reasoning };
    }
  } catch (error: any) {
    console.error('[AI_V2] Descriptive strategy error:', error.message);
  }
  return null;
}

async function evaluateUniversalPartStrategy(storeItem: StoreItem, candidates: SupplierItem[]): Promise<any | null> {
  const universalIndicators = [/universal/i, /fits all/i, /standard/i, /generic/i, /\d+mm/i, /\d+[\"]/i];
  const isUniversal = universalIndicators.some(pattern => pattern.test(storeItem.description || ''));
  if (!isUniversal) return null;
  const topCandidates = candidates.slice(0, 30);
  const prompt = `Match universal automotive part:\n\nStore: ${storeItem.partNumber} - ${storeItem.description}\n\nCandidates:\n${topCandidates.map((c, i) => `${i + 1}. ${c.partNumber} - ${c.description || 'N/A'}`).join('\n')}\n\nThis is a universal/standard part. Find matches by:\n- Physical dimensions (mm, inches)\n- Thread size\n- Material specifications\n- Universal fit indicators\n\nReturn JSON: {"hasMatch": true/false, "matchIndex": 1-30 or null, "confidence": 0.0-0.65}\n\nNOTE: Universal parts get lower confidence (max 0.65) due to specification variations.`;
  try {
    const response = await openai.chat.completions.create({
      model: AI_CONFIG_V2.MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 300,
    });
    const content = response.choices[0]?.message?.content;
    if (!content) return null;
    const result = JSON.parse(content);
    if (result.hasMatch && result.confidence >= 0.5) {
      const match = topCandidates[result.matchIndex - 1];
      console.log(`[AI_V2] Universal match: ${storeItem.partNumber} → ${match.partNumber}`);
      return { storeItemId: storeItem.id, supplierId: match.id, confidence: Math.min(result.confidence, 0.65), strategy: 'universal' };
    }
  } catch (error: any) {
    console.error('[AI_V2] Universal strategy error:', error.message);
  }
  return null;
}

async function processItem(storeItem: StoreItem, supplierCatalog: SupplierItem[]): Promise<any | null> {
  const candidates = selectBestCandidates(storeItem, supplierCatalog, AI_CONFIG_V2.CANDIDATE_LIMIT);
  if (candidates.length === 0) {
    console.log(`[AI_V2] No viable candidates for ${storeItem.partNumber}`);
    return null;
  }
  console.log(`[AI_V2] Selected ${candidates.length} candidates for ${storeItem.partNumber}`);
  const strategies = [evaluateExactPartStrategy, evaluateCrossReferenceStrategy, evaluateDescriptiveMatchStrategy, evaluateUniversalPartStrategy];
  for (const strategy of strategies) {
    const match = await strategy(storeItem, candidates);
    if (match && match.confidence >= AI_CONFIG_V2.MIN_CONFIDENCE) return match;
  }
  console.log(`[AI_V2] No match for ${storeItem.partNumber}`);
  return null;
}

export async function runEnhancedAIMatching(projectId: string, batchSize: number = AI_CONFIG_V2.BATCH_SIZE): Promise<{ matchesFound: number; itemsProcessed: number; estimatedCost: number }> {
  console.log(`[AI_V2] Starting enhanced AI matching for project ${projectId}`);
  const unmatchedItems = await prisma.storeItem.findMany({
    where: { projectId: projectId, matchCandidates: { none: { projectId: projectId, matchStage: { in: [1, 2, 3] } } } },
    select: { id: true, partNumber: true, lineCode: true, description: true, currentCost: true },
    take: batchSize,
    orderBy: { id: 'asc' },
  });
  console.log(`[AI_V2] Found ${unmatchedItems.length} unmatched items`);
  if (unmatchedItems.length === 0) return { matchesFound: 0, itemsProcessed: 0, estimatedCost: 0 };
  const supplierCatalog = await getSupplierCatalog(projectId);
  console.log(`[AI_V2] Loaded ${supplierCatalog.length} supplier items from cache`);
  const matches: any[] = [];
  let totalCost = 0;
  for (let i = 0; i < unmatchedItems.length; i++) {
    const item = unmatchedItems[i];
    if (totalCost >= AI_CONFIG_V2.MAX_COST) {
      console.log(`[AI_V2] ⚠️ Cost limit reached at $${totalCost.toFixed(2)}`);
      break;
    }
    try {
      const match = await processItem(item, supplierCatalog);
      if (match) matches.push(match);
      totalCost += AI_CONFIG_V2.COST_PER_ITEM;
      if (i < unmatchedItems.length - 1) await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error: any) {
      console.error(`[AI_V2] Error processing ${item.partNumber}:`, error.message);
    }
  }
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
        features: { strategy: m.strategy, matchType: m.matchType, reasoning: m.reasoning },
      })),
      skipDuplicates: true,
    });
    console.log(`[AI_V2] ✅ Saved ${matches.length} matches to database`);
  }
  const matchRate = (matches.length / unmatchedItems.length) * 100;
  console.log(`[AI_V2] === COMPLETE ===`);
  console.log(`[AI_V2] Matches: ${matches.length}/${unmatchedItems.length} (${matchRate.toFixed(1)}%)`);
  console.log(`[AI_V2] Cost: $${totalCost.toFixed(2)}`);
  return { matchesFound: matches.length, itemsProcessed: unmatchedItems.length, estimatedCost: totalCost };
}
