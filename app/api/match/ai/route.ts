/**
 * AI-Powered Matching API
 * POST /api/match/ai - Run AI matching for unmatched items
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import prisma from '@/app/lib/db/prisma';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const normalizePartNumber = (value?: string | null) =>
  (value || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();

const computePartSimilarity = (a: string, b: string) => {
  if (!a || !b) return 0;
  if (a === b) return 1;

  const shorter = a.length <= b.length ? a : b;
  const longer = a.length > b.length ? a : b;

  if (longer.includes(shorter)) {
    return shorter.length / longer.length;
  }

  let longest = 0;
  for (let i = 0; i < shorter.length; i++) {
    for (let j = i + 3; j <= shorter.length; j++) {
      const segment = shorter.slice(i, j);
      if (segment.length <= longest) continue;
      if (longer.includes(segment)) {
        longest = segment.length;
      }
    }
  }

  return longest / longer.length;
};

const scoreCandidate = (storeItem: any, supplierItem: any) => {
  const storeNorm = normalizePartNumber(storeItem.partNumber);
  const supplierNorm = normalizePartNumber(supplierItem.partNumber);
  const storeMfr = normalizePartNumber(storeItem.mfrPartNumber);
  const supplierMfr = normalizePartNumber(supplierItem.mfrPartNumber);

  const partScore = computePartSimilarity(storeNorm, supplierNorm);
  const mfrScore = computePartSimilarity(storeMfr, supplierMfr) * 0.4;
  const lineBonus = storeItem.lineCode && supplierItem.lineCode && storeItem.lineCode === supplierItem.lineCode ? 0.25 : 0;

  let descBonus = 0;
  if (storeItem.description && supplierItem.description) {
    const storeWords = new Set(storeItem.description.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3));
    const supplierWords = supplierItem.description.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);
    const overlap = supplierWords.filter((w: string) => storeWords.has(w)).length;
    if (overlap >= 2) {
      descBonus = Math.min(0.2, overlap * 0.05);
    }
  }

  return partScore + mfrScore + lineBonus + descBonus;
};

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { projectId, batchOffset = 0, batchSize = 100 } = body;

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: 'Project ID required' },
        { status: 400 }
      );
    }

    console.log(`[AI-MATCH] Starting AI matching for project: ${projectId}`);

    // Get unmatched store items
    const existingMatches = await prisma.matchCandidate.findMany({
      where: { projectId },
      select: { storeItemId: true },
    });
    const matchedIds = new Set(existingMatches.map((m) => m.storeItemId));
    
    console.log(`[AI-MATCH] Found ${existingMatches.length} total match records for ${matchedIds.size} unique store items`);
    if (existingMatches.length > matchedIds.size) {
      console.log(`[AI-MATCH] Note: ${existingMatches.length - matchedIds.size} store items have multiple matches`);
    }

    const allUnmatchedItems = await prisma.storeItem.findMany({
      where: {
        projectId,
        id: { notIn: Array.from(matchedIds) },
      },
      orderBy: { partNumber: 'asc' },
    });

    // BATCH PROCESSING: Process only a slice of unmatched items
    const unmatchedStoreItems = allUnmatchedItems.slice(batchOffset, batchOffset + batchSize);
    const remainingAfterBatch = allUnmatchedItems.length - (batchOffset + unmatchedStoreItems.length);
    
    console.log(`[AI-MATCH] Total unmatched items: ${allUnmatchedItems.length}`);
    console.log(`[AI-MATCH] Batch offset: ${batchOffset}, Batch size: ${batchSize}`);
    console.log(`[AI-MATCH] Processing items ${batchOffset} to ${batchOffset + unmatchedStoreItems.length}`);
    console.log(`[AI-MATCH] Remaining after batch: ${remainingAfterBatch}`);

    const supplierItems = await prisma.supplierItem.findMany({
      where: { projectId },
    });

    const supplierByExactPart = new Map<string, any>();
    const supplierByNormalizedPart = new Map<string, any[]>();

    for (const supplier of supplierItems) {
      supplierByExactPart.set(supplier.partNumber.toUpperCase(), supplier);

      const normalized = normalizePartNumber(supplier.partNumber || supplier.partNumberNorm);
      if (normalized) {
        if (!supplierByNormalizedPart.has(normalized)) {
          supplierByNormalizedPart.set(normalized, []);
        }
        supplierByNormalizedPart.get(normalized)!.push(supplier);
      }
    }

    console.log(`[AI-MATCH] Processing ${unmatchedStoreItems.length} unmatched items`);
    console.log(`[AI-MATCH] Against ${supplierItems.length} supplier items`);

    const aiMatches: any[] = [];
    let savedCount = 0;
    let itemCounter = 0;  // Track actual item number

    // Process in batches of 10 for API rate limiting
    for (let i = 0; i < unmatchedStoreItems.length; i += 10) {
      const batch = unmatchedStoreItems.slice(i, i + 10);
      
       for (const storeItem of batch) {
        try {
          itemCounter++;
          
          // OPTIMIZED candidate selection: score and prioritize
          let candidates: any[] = [];

          // Strategy 1: Same line code (highest priority - same manufacturer)
          if (storeItem.lineCode) {
            candidates = supplierItems.filter((s) => s.lineCode === storeItem.lineCode);
          }

          // Strategy 2: Similar manufacturer part numbers
          if (candidates.length < 80 && storeItem.mfrPartNumber && storeItem.mfrPartNumber.length >= 3) {
            const storeMfrNorm = normalizePartNumber(storeItem.mfrPartNumber);
            const mfrMatches = supplierItems.filter((s) => {
              if (!s.mfrPartNumber) return false;
              const supplierMfrNorm = normalizePartNumber(s.mfrPartNumber);
              return supplierMfrNorm && storeMfrNorm && computePartSimilarity(storeMfrNorm, supplierMfrNorm) >= 0.5;
            });
            candidates = [...new Set([...candidates, ...mfrMatches])];
          }

          // Strategy 3: Similar full part numbers (substring matching)
          if (candidates.length < 120) {
            const storePartUpper = normalizePartNumber(storeItem.partNumber || storeItem.partNumberNorm);
            const partMatches = supplierItems.filter((s) => {
              const supplierPartUpper = normalizePartNumber(s.partNumber || s.partNumberNorm);
              const similarity = computePartSimilarity(storePartUpper, supplierPartUpper);
              return similarity >= 0.45;
            });
            candidates = [...new Set([...candidates, ...partMatches])];
          }

          // Strategy 4: Description similarity (if available)
          if (candidates.length < 180 && storeItem.description) {
            const storeDesc = storeItem.description.toLowerCase();
            const descMatches = supplierItems.filter((s) => {
              if (!s.description) return false;
              const supplierDesc = s.description.toLowerCase();
              const storeWords = storeDesc.split(/\s+/).filter((w) => w.length > 3);
              const supplierWords = new Set(supplierDesc.split(/\s+/).filter((w) => w.length > 3));
              const commonWords = storeWords.filter((w) => supplierWords.has(w));
              return commonWords.length >= 2;
            });
            candidates = [...new Set([...candidates, ...descMatches])];
          }

          // Score candidates and take top-ranked list
          const candidateScores = new Map<string, number>();
          for (const candidate of candidates) {
            const score = scoreCandidate(storeItem, candidate);
            const previous = candidateScores.get(candidate.id) || 0;
            if (score > previous) {
              candidateScores.set(candidate.id, score);
            }
          }

          const rankedCandidates = Array.from(candidateScores.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 50)
            .map(([id, score]) => ({
              ...(candidates.find((c) => c.id === id) as any),
              __score: score,
            }));

          console.log(`[AI-MATCH] Item ${itemCounter}/${unmatchedStoreItems.length}: ${storeItem.partNumber} - ${rankedCandidates.length} ranked candidates`);
          
          // Create optimized prompt for AI
          const prompt = `You are an expert automotive parts matcher. Candidates are pre-ranked (best first). Find the BEST match for this store part from the supplier catalog.

MATCHING EXAMPLES:
✓ MATCH: "ABC12345" matches "ABC-12345" (same part, different punctuation)
✓ MATCH: "ABC12345" matches "12345" (line code stripped)
✓ MATCH: "LTG-G6002" matches "LTGG6002" (punctuation removed)
✓ MATCH: "ABH8865" matches "BAT08865" (different line code, same core number)
✓ MATCH: "20SC" matches "ABC20SC" (substring match)
✗ NO MATCH: "ABC12345" vs "ABC54321" (different core numbers)

MATCHING RULES:
1. **Punctuation doesn't matter**: ABC-123, ABC.123, ABC 123, ABC123 are ALL the same
2. **Line codes can differ**: ABH8865 = BAT08865 = 8865 (focus on core numbers)
3. **Substring matches count**: If one part number contains the other, it's likely a match
4. **60%+ similarity is acceptable**: Minor differences are OK in automotive parts
5. **Descriptions help**: If descriptions match, part numbers can differ more

Store Item:
- Part: ${storeItem.partNumber}
- Desc: ${storeItem.description || 'N/A'}
- Line: ${storeItem.lineCode || 'N/A'}
- Mfr: ${storeItem.mfrPartNumber || 'N/A'}

Supplier Catalog (${rankedCandidates.length} candidates):
${rankedCandidates.map((s, idx) => `${idx + 1}. ${s.partNumber}${s.description ? ` - ${s.description}` : ''}${s.lineCode ? ` [${s.lineCode}]` : ''}${s.mfrPartNumber ? ` [${s.mfrPartNumber}]` : ''} (score: ${s.__score.toFixed(2)})`).join('\n')}

Find the BEST match. When in doubt, MATCH IT (60%+ similarity). Respond with ONLY valid JSON:
{
  "match": true/false,
  "supplierPartNumber": "EXACT_PART_NUMBER" or null,
  "confidence": 0.6-1.0,
  "reason": "Brief reason"
}`;

          const completion = await openai.chat.completions.create({
            model: 'gpt-4.1-mini',
            messages: [
              {
                role: 'system',
                content: 'You are an expert automotive parts matcher. Your job is to find matches even when part numbers have minor differences. Be generous with matches - 60%+ similarity is acceptable. Always respond with valid JSON only.',
              },
              {
                role: 'user',
                content: prompt,
              },
            ],
            temperature: 0.3,  // Lower for more consistent matching
            max_tokens: 250,
          });

          let responseText = completion.choices[0]?.message?.content?.trim();
          if (!responseText) continue;

          // Remove markdown code blocks and backticks more aggressively
          responseText = responseText
            .replace(/^```json/gm, '')
            .replace(/^```/gm, '')
            .replace(/```$/gm, '')
            .replace(/^`+/gm, '')
            .replace(/`+$/gm, '')
            .trim();

          // Extract JSON if there's text before/after
          const jsonMatch = responseText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            responseText = jsonMatch[0];
          }

          // Parse AI response
          const aiResponse = JSON.parse(responseText);

          if (aiResponse.match && aiResponse.supplierPartNumber) {
            const proposedPart = aiResponse.supplierPartNumber;
            const normalizedProposed = normalizePartNumber(proposedPart);

            let supplierItem = supplierByExactPart.get(proposedPart.toUpperCase()) || null;

            if (!supplierItem && normalizedProposed) {
              const normalizedHits = supplierByNormalizedPart.get(normalizedProposed);
              if (normalizedHits && normalizedHits.length > 0) {
                supplierItem = normalizedHits[0];
              }
            }

            if (!supplierItem && normalizedProposed) {
              supplierItem = rankedCandidates.find((candidate) => {
                const candidateNorm = normalizePartNumber(candidate.partNumber || candidate.partNumberNorm);
                return (
                  candidateNorm === normalizedProposed ||
                  candidateNorm.includes(normalizedProposed) ||
                  normalizedProposed.includes(candidateNorm)
                );
              }) || null;
            }

            if (!supplierItem && normalizedProposed) {
              supplierItem = rankedCandidates.find((candidate) => {
                const candidateNorm = normalizePartNumber(candidate.partNumber || candidate.partNumberNorm);
                return computePartSimilarity(candidateNorm, normalizedProposed) >= 0.6;
              }) || null;
            }

            if (supplierItem) {
              aiMatches.push({
                projectId,
                storeItemId: storeItem.id,
                targetType: 'SUPPLIER',
                targetId: supplierItem.id,
                method: 'AI',
                confidence: aiResponse.confidence,
                matchStage: 3,  // AI matching is stage 3
                features: {
                  reason: aiResponse.reason,
                  aiModel: 'gpt-4.1-mini',
                  normalizedResponse: normalizedProposed,
                  resolution: supplierByExactPart.has(proposedPart.toUpperCase())
                    ? 'exact_part_number'
                    : supplierByNormalizedPart.has(normalizedProposed)
                      ? 'normalized_part_match'
                      : 'candidate_fuzzy',
                },
                status: 'PENDING',
              });
              console.log(`[AI-MATCH] Found match: ${storeItem.partNumber} -> ${supplierItem.partNumber} (${aiResponse.confidence}) via ${normalizedProposed}`);
            } else {
              console.log(`[AI-MATCH] Could not resolve AI response for ${storeItem.partNumber}: ${proposedPart}`);
            }
          }
        } catch (error: any) {
          console.error(`[AI-MATCH] Error processing ${storeItem.partNumber}:`, error.message);
          continue;
        }
      }
      
      // Save incrementally every 5 matches to avoid losing data on timeout
      if (aiMatches.length >= 5) {
        await prisma.matchCandidate.createMany({
          data: aiMatches,
          skipDuplicates: true,
        });
        console.log(`[AI-MATCH] Saved batch of ${aiMatches.length} matches (total saved: ${savedCount + aiMatches.length})`);
        savedCount += aiMatches.length;
        aiMatches.length = 0; // Clear the array
      }

      // Small delay between batches to avoid rate limits
      if (i + 10 < unmatchedStoreItems.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    // Save any remaining AI matches
    if (aiMatches.length > 0) {
      await prisma.matchCandidate.createMany({
        data: aiMatches,
        skipDuplicates: true,
      });
      console.log(`[AI-MATCH] Saved final batch of ${aiMatches.length} matches`);
      savedCount += aiMatches.length;
    }
    
    console.log(`[AI-MATCH] Total matches saved: ${savedCount}`);

    // Calculate batch progress
    const totalProcessed = batchOffset + unmatchedStoreItems.length;
    const hasMore = remainingAfterBatch > 0;
    const nextOffset = hasMore ? batchOffset + batchSize : null;
    
    // Estimate cost (rough: ~$0.002 per item)
    const estimatedCost = (unmatchedStoreItems.length * 0.002).toFixed(2);
    const totalEstimatedCost = (allUnmatchedItems.length * 0.002).toFixed(2);
    
    return NextResponse.json({
      success: true,
      message: `Created ${savedCount} AI match candidates in this batch`,
      matchCount: savedCount,
      processed: unmatchedStoreItems.length,
      batch: {
        processed: totalProcessed,
        total: allUnmatchedItems.length,
        remaining: remainingAfterBatch,
        hasMore,
        nextOffset,
        batchSize,
        estimatedCost,
        totalEstimatedCost,
      },
    });
  } catch (error: any) {
    console.error('[AI-MATCH] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to run AI matching' },
      { status: 500 }
    );
  }
}
