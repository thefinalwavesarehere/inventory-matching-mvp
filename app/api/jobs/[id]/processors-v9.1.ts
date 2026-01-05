/**
 * Background Job Processors - V9.1
 * AI Parallelization: Process 10 items concurrently to optimize throughput
 */

import OpenAI from 'openai';
import prisma from '@/app/lib/db/prisma';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * V9.1: Process AI matching with 10 concurrent requests
 * Uses Promise.all to process items in parallel while respecting OpenAI rate limits
 */
export async function processAIMatching(
  storeItems: any[],
  supplierItems: any[],
  projectId: string
): Promise<number> {
  console.log(`[AI-V9.1] Starting AI matching with 10-concurrent parallelization`);
  console.log(`[AI-V9.1] Processing ${storeItems.length} items`);
  
  let matchCount = 0;

  // V9.1: Process in batches of 10 concurrently (not sequentially)
  for (let i = 0; i < storeItems.length; i += 10) {
    const batch = storeItems.slice(i, i + 10);
    console.log(`[AI-V9.1] Processing batch ${Math.floor(i/10) + 1}: ${batch.length} items in parallel`);

    // Process all 10 items in parallel using Promise.all
    const batchResults = await Promise.all(
      batch.map(storeItem => processAIItem(storeItem, supplierItems, projectId))
    );

    // Count successful matches
    const batchMatches = batchResults.filter(result => result === true).length;
    matchCount += batchMatches;
    
    console.log(`[AI-V9.1] Batch complete: ${batchMatches}/${batch.length} matches found`);
  }

  console.log(`[AI-V9.1] AI matching complete: ${matchCount} total matches`);
  return matchCount;
}

/**
 * Process a single store item with AI matching
 * Returns true if a match was found and saved
 */
async function processAIItem(
  storeItem: any,
  supplierItems: any[],
  projectId: string
): Promise<boolean> {
  try {
    // Get relevant candidates (top 50)
    const candidates = getCandidates(storeItem, supplierItems, 50);

    if (candidates.length === 0) {
      console.log(`[AI-V9.1] No candidates for ${storeItem.partNumber}`);
      return false;
    }

    const prompt = `You are an automotive parts expert. Find the BEST match for this store part from the supplier catalog.

MATCHING EXAMPLES:
✓ MATCH: "ABC10026A" matches "DLPEG10026" (different line code, same core)
✓ MATCH: "ABC-123" matches "ABC123" (punctuation removed)
✓ MATCH: "LTG-G6002" matches "LTGG6002" (punctuation removed)
✓ MATCH: "ABH8865" matches "BAT08865" (different line code, similar core)
✗ NO MATCH: "ABC12345" vs "ABC54321" (different core numbers)

Store Part to Match:
- Part: ${storeItem.partNumber}
- Desc: ${storeItem.description || 'N/A'}
- Line: ${storeItem.lineCode || 'N/A'}
- Mfr: ${storeItem.mfrPartNumber || 'N/A'}

Supplier Catalog (${candidates.length} most relevant items):
${candidates.map((s, idx) => `${idx + 1}. ${s.partNumber}${s.description ? ` - ${s.description}` : ''}`).join('\\n')}

MATCHING RULES:
1. **Punctuation doesn't matter**: ABC-123 = ABC.123 = ABC 123 = ABC123
2. **Line codes can differ**: Focus on core numbers/letters
3. **60%+ similarity is acceptable**: Minor differences are OK
4. **When in doubt, MATCH IT** - be generous

Respond with ONLY valid JSON:
{
  "match": true/false,
  "supplierPartNumber": "EXACT_PART_NUMBER" or null,
  "confidence": 0.6-1.0,
  "reason": "Brief reason"
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an expert automotive parts matcher. Be generous - 60%+ similarity is acceptable. Always respond with valid JSON only.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 250,
    });

    let responseText = response.choices[0]?.message?.content?.trim();
    if (!responseText) {
      console.log(`[AI-V9.1] Empty response for ${storeItem.partNumber}`);
      return false;
    }

    // Remove markdown code blocks
    responseText = responseText
      .replace(/^```json/gm, '')
      .replace(/^```/gm, '')
      .replace(/`/g, '')
      .trim();

    const aiResponse = JSON.parse(responseText);

    if (aiResponse.match && aiResponse.supplierPartNumber) {
      const supplier = supplierItems.find(
        (s) => s.partNumber === aiResponse.supplierPartNumber
      );

      if (supplier) {
        await prisma.matchCandidate.create({
          data: {
            projectId,
            storeItemId: storeItem.id,
            targetType: 'SUPPLIER',
            targetId: supplier.id,
            method: 'AI',
            confidence: aiResponse.confidence || 0.8,
            matchStage: 3,
            status: 'PENDING',
            features: {
              aiReason: aiResponse.reason,
              model: 'gpt-4.1-mini',
              candidatesShown: candidates.length,
              version: 'V9.1-parallel',
            },
          },
        });

        console.log(`[AI-V9.1] Match: ${storeItem.partNumber} -> ${supplier.partNumber} (${aiResponse.confidence})`);
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error(`[AI-V9.1] Error processing ${storeItem.partNumber}:`, error);
    return false;
  }
}

/**
 * Get top N candidate supplier items for a store item
 * Uses simple similarity scoring
 */
function getCandidates(storeItem: any, supplierItems: any[], topN: number): any[] {
  const storePart = storeItem.partNumber.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  
  const scored = supplierItems.map(supplier => {
    const supplierPart = supplier.partNumber.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    
    // Calculate similarity score
    let score = 0;
    
    // Exact match
    if (supplierPart === storePart) {
      score = 100;
    }
    // Substring match
    else if (supplierPart.includes(storePart) || storePart.includes(supplierPart)) {
      score = 80;
    }
    // Similarity based on common characters
    else {
      const commonChars = storePart.split('').filter(c => supplierPart.includes(c)).length;
      score = (commonChars / Math.max(storePart.length, supplierPart.length)) * 60;
    }
    
    // Boost if line codes match
    if (storeItem.lineCode && supplier.lineCode) {
      const storeLineNorm = storeItem.lineCode.replace(/[^A-Z0-9]/gi, '').toUpperCase();
      const supplierLineNorm = supplier.lineCode.replace(/[^A-Z0-9]/gi, '').toUpperCase();
      if (storeLineNorm === supplierLineNorm) {
        score += 20;
      }
    }
    
    // Boost if descriptions have common words
    if (storeItem.description && supplier.description) {
      const storeWords = storeItem.description.toUpperCase().split(/\s+/).filter((w: string) => w.length > 3);
      const supplierWords = supplier.description.toUpperCase().split(/\s+/).filter((w: string) => w.length > 3);
      const commonWords = storeWords.filter((w: string) => supplierWords.includes(w));
      if (commonWords.length >= 2) {
        score += 15;
      }
    }
    
    return { supplier, score };
  });
  
  // Sort by score descending and take top N
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map(item => item.supplier);
}

/**
 * Process web search matching using multi-strategy approach
 * (Unchanged from original - not part of V9.1 parallelization)
 */
export async function processWebSearchMatching(
  storeItems: any[],
  supplierItems: any[],
  projectId: string
): Promise<number> {
  // Import original implementation
  const { processWebSearchMatching: originalWebSearch } = await import('./processors');
  return originalWebSearch(storeItems, supplierItems, projectId);
}
