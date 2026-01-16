/**
 * Stage 5: Human Review Classification
 * 
 * Classifies unmatchable items and flags them for human review.
 * Provides intelligent categorization and recommendations.
 * 
 * Expected impact: 100% coverage (remaining 15-20% flagged for review)
 * Cost: $0.01 per item (GPT-4o classification)
 */

import prisma from '@/app/lib/db/prisma';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const CLASSIFIER_CONFIG = {
  BATCH_SIZE: 100,
  MAX_COST: 10,
  COST_PER_CLASSIFICATION: 0.01,
  MODEL: 'gpt-4o',
};

interface StoreItem {
  id: string;
  partNumber: string;
  lineCode: string | null;
  description: string | null;
}

interface AttemptHistory {
  fuzzyAttempted: boolean;
  aiAttempted: boolean;
  webSearchAttempted: boolean;
  supersessionAttempted: boolean;
}

interface UnmatchableClassification {
  category:
    | 'discontinued'
    | 'private_label'
    | 'data_quality'
    | 'wrong_catalog'
    | 'custom_fabrication'
    | 'insufficient_info'
    | 'other';
  confidence: number;
  recommendation: 'delete' | 'review' | 'research' | 'update_data';
  notes: string;
}

/**
 * Classify why an item cannot be matched
 */
async function classifyUnmatchableItem(
  storeItem: StoreItem,
  attemptHistory: AttemptHistory
): Promise<UnmatchableClassification | null> {
  const prompt = `Classify why this automotive part cannot be matched:

Part: ${storeItem.partNumber}
Manufacturer: ${storeItem.lineCode || 'Unknown'}
Description: ${storeItem.description || 'N/A'}

Matching attempts:
- Fuzzy matching: ${attemptHistory.fuzzyAttempted ? 'Failed' : 'N/A'}
- AI matching: ${attemptHistory.aiAttempted ? 'Failed' : 'N/A'}
- Web search: ${attemptHistory.webSearchAttempted ? 'Failed' : 'N/A'}
- Supersession lookup: ${attemptHistory.supersessionAttempted ? 'Failed' : 'N/A'}

Why is this part not matching? Classify as:
1. "discontinued" - Part no longer manufactured
2. "private_label" - Store-specific custom part
3. "data_quality" - Typo or bad data in part number/description
4. "wrong_catalog" - Part from different manufacturer than supplier catalog
5. "custom_fabrication" - Custom-made or fabricated part
6. "insufficient_info" - Not enough information to match
7. "other" - Unknown reason

Return JSON:
{
  "category": "discontinued|private_label|data_quality|wrong_catalog|custom_fabrication|insufficient_info|other",
  "confidence": 0.0-1.0,
  "recommendation": "delete|review|research|update_data",
  "notes": "explanation for human reviewer"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: CLASSIFIER_CONFIG.MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 300,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    const result = JSON.parse(content) as UnmatchableClassification;
    return result;
  } catch (error: any) {
    console.error('[CLASSIFIER] Error classifying item:', error.message);
    return null;
  }
}

/**
 * Check which matching stages were attempted for an item
 */
async function getAttemptHistory(
  storeItemId: string,
  projectId: string
): Promise<AttemptHistory> {
  const matchCandidates = await prisma.matchCandidate.findMany({
    where: {
      storeItemId,
      projectId,
    },
    select: {
      method: true,
      matchStage: true,
    },
  });

  return {
    fuzzyAttempted: matchCandidates.some(m => m.matchStage === 2),
    aiAttempted: matchCandidates.some(m => m.matchStage === 3 && m.method === 'AI'),
    webSearchAttempted: matchCandidates.some(m => m.matchStage === 4),
    supersessionAttempted: matchCandidates.some(m => m.method === 'SUPERSESSION'),
  };
}

/**
 * Process a single item
 */
async function processItem(
  storeItem: StoreItem,
  projectId: string
): Promise<any | null> {
  // Get attempt history
  const attemptHistory = await getAttemptHistory(storeItem.id, projectId);

  // Classify
  const classification = await classifyUnmatchableItem(storeItem, attemptHistory);

  if (!classification) {
    console.log(`[CLASSIFIER] Failed to classify ${storeItem.partNumber}`);
    return null;
  }

  console.log(
    `[CLASSIFIER] ${storeItem.partNumber} → ${classification.category} (${classification.recommendation})`
  );

  return {
    storeItemId: storeItem.id,
    classification,
  };
}

/**
 * Main classification function
 */
export async function runHumanReviewClassification(
  projectId: string,
  batchSize: number = CLASSIFIER_CONFIG.BATCH_SIZE
): Promise<{ itemsClassified: number; itemsProcessed: number; estimatedCost: number }> {
  console.log(`[CLASSIFIER] Starting human review classification for project ${projectId}`);

  // Get items with no matches from any stage
  const unmatchedItems = await prisma.storeItem.findMany({
    where: {
      projectId: projectId,
      matchCandidates: {
        none: {
          projectId: projectId,
          status: 'APPROVED', // No approved matches
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

  console.log(`[CLASSIFIER] Found ${unmatchedItems.length} unmatched items`);

  if (unmatchedItems.length === 0) {
    return { itemsClassified: 0, itemsProcessed: 0, estimatedCost: 0 };
  }

  const classifications: any[] = [];
  let totalCost = 0;

  // Process items sequentially
  for (let i = 0; i < unmatchedItems.length; i++) {
    const item = unmatchedItems[i];

    if (totalCost >= CLASSIFIER_CONFIG.MAX_COST) {
      console.log(`[CLASSIFIER] ⚠️ Cost limit reached at $${totalCost.toFixed(2)}`);
      break;
    }

    try {
      const result = await processItem(item, projectId);

      if (result) {
        classifications.push(result);
      }

      totalCost += CLASSIFIER_CONFIG.COST_PER_CLASSIFICATION;

      // Rate limit: 500ms between items
      if (i < unmatchedItems.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error: any) {
      console.error(`[CLASSIFIER] Error processing ${item.partNumber}:`, error.message);
    }
  }

  // Save classifications to database
  if (classifications.length > 0) {
    // Create match candidates with special "HUMAN_REVIEW" method
    await prisma.matchCandidate.createMany({
      data: classifications.map(c => ({
        projectId: projectId,
        storeItemId: c.storeItemId,
        targetId: null, // No target for human review
        targetType: 'SUPPLIER',
        matchStage: 5,
        method: 'HUMAN_REVIEW',
        confidence: 0, // No confidence for human review
        status: 'PENDING',
        features: {
          category: c.classification.category,
          recommendation: c.classification.recommendation,
          notes: c.classification.notes,
          classificationConfidence: c.classification.confidence,
        },
      })),
      skipDuplicates: true,
    });

    console.log(`[CLASSIFIER] ✅ Saved ${classifications.length} classifications to database`);
  }

  const classificationRate = (classifications.length / unmatchedItems.length) * 100;
  console.log(`[CLASSIFIER] === COMPLETE ===`);
  console.log(
    `[CLASSIFIER] Classified: ${classifications.length}/${unmatchedItems.length} (${classificationRate.toFixed(1)}%)`
  );
  console.log(`[CLASSIFIER] Cost: $${totalCost.toFixed(2)}`);

  return {
    itemsClassified: classifications.length,
    itemsProcessed: unmatchedItems.length,
    estimatedCost: totalCost,
  };
}

/**
 * Get classification statistics for a project
 */
export async function getClassificationStats(projectId: string): Promise<{
  total: number;
  byCategory: Record<string, number>;
  byRecommendation: Record<string, number>;
}> {
  const classifications = await prisma.matchCandidate.findMany({
    where: {
      projectId,
      method: 'HUMAN_REVIEW',
    },
    select: {
      features: true,
    },
  });

  const byCategory: Record<string, number> = {};
  const byRecommendation: Record<string, number> = {};

  classifications.forEach(c => {
    const features = c.features as any;
    const category = features.category || 'unknown';
    const recommendation = features.recommendation || 'unknown';

    byCategory[category] = (byCategory[category] || 0) + 1;
    byRecommendation[recommendation] = (byRecommendation[recommendation] || 0) + 1;
  });

  return {
    total: classifications.length,
    byCategory,
    byRecommendation,
  };
}
