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
          
          // OPTIMIZED candidate selection: Show AI the most relevant items
          let candidates: any[] = [];
          
          // Strategy 1: Same line code (highest priority - same manufacturer)
          if (storeItem.lineCode) {
            candidates = supplierItems.filter(s => s.lineCode === storeItem.lineCode);
          }
          
          // Strategy 2: Similar manufacturer part numbers
          if (candidates.length < 80 && storeItem.mfrPartNumber && storeItem.mfrPartNumber.length >= 3) {
            const storeMfr = storeItem.mfrPartNumber.toUpperCase();
            const mfrMatches = supplierItems.filter(s => {
              if (!s.mfrPartNumber) return false;
              const supplierMfr = s.mfrPartNumber.toUpperCase();
              // Check for 3+ char prefix match or substring containment
              return storeMfr.length >= 3 && supplierMfr.length >= 3 &&
                     (storeMfr.startsWith(supplierMfr.substring(0, 3)) ||
                      supplierMfr.startsWith(storeMfr.substring(0, 3)) ||
                      storeMfr.includes(supplierMfr) ||
                      supplierMfr.includes(storeMfr));
            });
            candidates = [...new Set([...candidates, ...mfrMatches])];
          }
          
          // Strategy 3: Similar full part numbers (substring matching)
          if (candidates.length < 120) {
            const storePartUpper = storeItem.partNumber.toUpperCase().replace(/[^A-Z0-9]/g, '');
            const partMatches = supplierItems.filter(s => {
              const supplierPartUpper = s.partNumber.toUpperCase().replace(/[^A-Z0-9]/g, '');
              // Check for 4+ char substring match
              if (storePartUpper.length < 4 || supplierPartUpper.length < 4) return false;
              for (let j = 0; j <= storePartUpper.length - 4; j++) {
                const substring = storePartUpper.substring(j, j + 4);
                if (supplierPartUpper.includes(substring)) return true;
              }
              return false;
            });
            candidates = [...new Set([...candidates, ...partMatches])];
          }
          
          // Strategy 4: Description similarity (if available)
          if (candidates.length < 150 && storeItem.description) {
            const storeDesc = storeItem.description.toLowerCase();
            const descMatches = supplierItems.filter(s => {
              if (!s.description) return false;
              const supplierDesc = s.description.toLowerCase();
              // Check if descriptions share 2+ significant words
              const storeWords = storeDesc.split(/\s+/).filter(w => w.length > 3);
              const supplierWords = new Set(supplierDesc.split(/\s+/).filter(w => w.length > 3));
              const commonWords = storeWords.filter(w => supplierWords.has(w));
              return commonWords.length >= 2;
            });
            candidates = [...new Set([...candidates, ...descMatches])];
          }
          
          // Limit to 150 candidates (increased from 100 for better coverage)
          candidates = candidates.slice(0, 150);
          
          console.log(`[AI-MATCH] Item ${itemCounter}/${unmatchedStoreItems.length}: ${storeItem.partNumber} - ${candidates.length} candidates`);
          
          // Create optimized prompt for AI
          const prompt = `You are an expert automotive parts matcher. Your goal is to find the BEST POSSIBLE match for this store part from the supplier catalog.

IMPORTANT MATCHING RULES:
1. Part numbers may have different punctuation (-/./ ) but same core numbers/letters
2. Line codes (first 2-3 letters) indicate manufacturer - prioritize same line code
3. Descriptions help confirm matches even if part numbers differ slightly
4. Accept matches with 60%+ similarity - automotive parts often have minor variations
5. Look for substring matches (one part number contains the other)
6. Manufacturer part numbers (after line code) are most important for matching

Store Item to Match:
- Part Number: ${storeItem.partNumber}
- Description: ${storeItem.description || 'N/A'}
- Line Code: ${storeItem.lineCode || 'N/A'}
- Manufacturer Part: ${storeItem.mfrPartNumber || 'N/A'}

Supplier Catalog (${candidates.length} pre-filtered candidates):
${candidates.map((s, idx) => `${idx + 1}. ${s.partNumber}${s.description ? ` - ${s.description}` : ''}${s.lineCode ? ` [Line: ${s.lineCode}]` : ''}${s.mfrPartNumber ? ` [Mfr: ${s.mfrPartNumber}]` : ''}`).join('\n')}

Find the BEST match. Be generous - minor differences are OK. Respond with ONLY valid JSON:
{
  "match": true/false,
  "supplierPartNumber": "EXACT_PART_NUMBER" or null,
  "confidence": 0.6-1.0,
  "reason": "Why this matches (line code, part similarity, description, etc.)"
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
            temperature: 0.5,  // Increased for more creative matching
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
            // Find the supplier item
            const supplierItem = supplierItems.find(
              (s) => s.partNumber === aiResponse.supplierPartNumber
            );

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
                },
                status: 'PENDING',
              });
              console.log(`[AI-MATCH] Found match: ${storeItem.partNumber} -> ${supplierItem.partNumber} (${aiResponse.confidence})`);
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
