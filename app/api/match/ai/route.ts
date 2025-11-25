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

    // Process in batches of 10
    for (let i = 0; i < unmatchedStoreItems.length; i += 10) {
      const batch = unmatchedStoreItems.slice(i, i + 10);
      
       for (const storeItem of batch) {
        try {
          // Smart candidate selection: prioritize same line code, then similar part numbers
          let candidates = supplierItems.filter(s => s.lineCode === storeItem.lineCode);
          
          // If too few same-line candidates, add items with similar part numbers
          if (candidates.length < 50) {
            const storePartUpper = storeItem.partNumber.toUpperCase();
            const similarParts = supplierItems.filter(s => {
              const supplierPartUpper = s.partNumber.toUpperCase();
              // Check if parts share significant substring (at least 4 chars)
              return storePartUpper.length >= 4 && supplierPartUpper.length >= 4 &&
                     (storePartUpper.includes(supplierPartUpper.substring(0, 4)) ||
                      supplierPartUpper.includes(storePartUpper.substring(0, 4)));
            });
            candidates = [...new Set([...candidates, ...similarParts])];
          }
          
          // If still too few, add random sample
          if (candidates.length < 100) {
            const remaining = supplierItems.filter(s => !candidates.includes(s));
            const randomSample = remaining.sort(() => Math.random() - 0.5).slice(0, 100 - candidates.length);
            candidates = [...candidates, ...randomSample];
          }
          
          // Limit to 100 for token efficiency
          candidates = candidates.slice(0, 100);
          
          // Create prompt for AI
          const prompt = `You are an automotive parts matching expert. Match this store inventory item to the most likely supplier part.

Store Item:
- Part Number: ${storeItem.partNumber}
- Description: ${storeItem.description || 'N/A'}
- Line Code: ${storeItem.lineCode || 'N/A'}

Supplier Catalog (${candidates.length} relevant items):
${candidates.map((s, idx) => `${idx + 1}. ${s.partNumber}${s.description ? ` - ${s.description}` : ''}${s.lineCode ? ` [${s.lineCode}]` : ''}`).join('\n')}

Respond with ONLY a JSON object in this exact format:
{
  "match": true/false,
  "supplierPartNumber": "PART123" or null,
  "confidence": 0.0-1.0,
  "reason": "Brief explanation"
}`;

          const completion = await openai.chat.completions.create({
            model: 'gpt-4.1-mini',
            messages: [
              {
                role: 'system',
                content: 'You are a parts matching expert. Always respond with valid JSON only.',
              },
              {
                role: 'user',
                content: prompt,
              },
            ],
            temperature: 0.3,
            max_tokens: 200,
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
