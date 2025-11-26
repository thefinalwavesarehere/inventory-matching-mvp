/**
 * Web Search Matching API
 * POST /api/match/web-search - Use Perplexity to search web for unmatched parts
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import prisma from '@/app/lib/db/prisma';
import OpenAI from 'openai';

const perplexity = new OpenAI({
  apiKey: process.env.PERPLEXITY_API_KEY,
  baseURL: 'https://api.perplexity.ai',
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
    const { projectId, batchOffset = 0, batchSize = 50 } = body;

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: 'Project ID required' },
        { status: 400 }
      );
    }

    console.log(`[WEB-SEARCH] Starting web search matching for project: ${projectId}`);

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
    
    console.log(`[WEB-SEARCH] Total unmatched items: ${allUnmatchedItems.length}`);
    console.log(`[WEB-SEARCH] Batch offset: ${batchOffset}, Batch size: ${batchSize}`);
    console.log(`[WEB-SEARCH] Processing items ${batchOffset} to ${batchOffset + unmatchedStoreItems.length}`);
    console.log(`[WEB-SEARCH] Remaining after batch: ${remainingAfterBatch}`);

    console.log(`[WEB-SEARCH] Processing ${unmatchedStoreItems.length} unmatched items`);

    // Load supplier catalog for intelligent web search
    const supplierItems = await prisma.supplierItem.findMany({
      where: { projectId },
    });
    console.log(`[WEB-SEARCH] Loaded ${supplierItems.length} supplier items for reference`);

    const webMatches: any[] = [];
    let savedCount = 0;

    // Process each unmatched item
    for (let i = 0; i < unmatchedStoreItems.length; i++) {
      const storeItem = unmatchedStoreItems[i];
      try {
        // Get relevant supplier candidates for context
        let candidates: any[] = [];
        if (storeItem.lineCode) {
          candidates = supplierItems.filter(s => s.lineCode === storeItem.lineCode).slice(0, 30);
        }
        if (candidates.length < 20 && storeItem.mfrPartNumber) {
          const storeMfr = storeItem.mfrPartNumber.toUpperCase();
          const mfrMatches = supplierItems.filter(s => {
            if (!s.mfrPartNumber) return false;
            const supplierMfr = s.mfrPartNumber.toUpperCase();
            return supplierMfr.startsWith(storeMfr.substring(0, Math.min(3, storeMfr.length)));
          }).slice(0, 30);
          candidates = [...new Set([...candidates, ...mfrMatches])].slice(0, 30);
        }

        // Create optimized prompt for web search with supplier context
        const catalogContext = candidates.length > 0 
          ? `\n\nOur Supplier Catalog (${candidates.length} similar items for reference):\n${candidates.map((s, idx) => `${idx + 1}. ${s.partNumber}${s.description ? ` - ${s.description}` : ''}`).slice(0, 20).join('\n')}`
          : '';

        const prompt = `You are an automotive parts expert. Find the BEST match for this store part.

IMPORTANT: First check if this part matches anything in our supplier catalog below. If you find a match there, use it. Otherwise, search the web for alternatives.

Store Part to Match:
- Part Number: ${storeItem.partNumber}
- Description: ${storeItem.description || 'N/A'}
- Line Code: ${storeItem.lineCode || 'N/A'}
- Manufacturer Part: ${storeItem.mfrPartNumber || 'N/A'}${catalogContext}

MATCHING RULES:
1. Check our supplier catalog first - prefer matches from there
2. Part numbers may have different punctuation but same core numbers
3. Line codes indicate manufacturer - prioritize same line code
4. Accept 60%+ similarity - minor variations are OK
5. If no supplier catalog match, search web for: RockAuto, AutoZone, O'Reilly, NAPA, etc.

Respond with ONLY valid JSON:
{
  "match": true/false,
  "supplierPartNumber": "EXACT_PART_NUMBER" or null,
  "supplierName": "Company Name" or null,
  "confidence": 0.6-1.0,
  "description": "Part description",
  "price": "$XX.XX" or null,
  "sourceUrl": "https://..." or null,
  "reason": "Why this matches (catalog match, web search, etc.)"
}`;

        const response = await perplexity.chat.completions.create({
          model: 'sonar-pro',
          messages: [
            {
              role: 'system',
              content: 'You are an expert automotive parts matcher. Check the supplier catalog first, then search the web if needed. Be generous with matches - 60%+ similarity is acceptable. Always respond with valid JSON only.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.4,  // Increased for more creative matching
          max_tokens: 600,
        });

        let responseText = response.choices[0]?.message?.content?.trim();
        if (!responseText) continue;

        // Remove markdown code blocks and backticks
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

        // Parse response
        const webResponse = JSON.parse(responseText);

        if (webResponse.match && webResponse.supplierPartNumber) {
          console.log(`[WEB-SEARCH] Found match: ${storeItem.partNumber} -> ${webResponse.supplierPartNumber} (${webResponse.confidence})`);

          // Create a "virtual" supplier item for web-found matches
          // We'll store the web data in the features field
          webMatches.push({
            projectId,
            storeItemId: storeItem.id,
            targetType: 'SUPPLIER', // Using SUPPLIER type but it's actually a web result
            targetId: 'WEB_' + storeItem.id, // Special ID to indicate web-found match
            method: 'AI', // Temporarily using AI until WEB_SEARCH is added to database enum
            confidence: webResponse.confidence,
            features: {
              webSearch: true,
              supplierPartNumber: webResponse.supplierPartNumber,
              supplierName: webResponse.supplierName,
              description: webResponse.description,
              price: webResponse.price,
              sourceUrl: webResponse.sourceUrl,
              reason: webResponse.reason,
            },
            status: 'PENDING',
          });
          
          // Save incrementally every 5 matches to avoid losing data on timeout
          if (webMatches.length >= 5) {
            await prisma.matchCandidate.createMany({
              data: webMatches,
              skipDuplicates: true,
            });
            console.log(`[WEB-SEARCH] Saved batch of ${webMatches.length} matches (total saved: ${savedCount + webMatches.length})`);
            savedCount += webMatches.length;
            webMatches.length = 0; // Clear the array
          }
        }

        // Rate limiting - 1 second between requests
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error: any) {
        console.error(`[WEB-SEARCH] Error processing ${storeItem.partNumber}:`, error.message);
        continue;
      }
    }

    // Save any remaining web search matches
    if (webMatches.length > 0) {
      await prisma.matchCandidate.createMany({
        data: webMatches,
        skipDuplicates: true,
      });
      console.log(`[WEB-SEARCH] Saved final batch of ${webMatches.length} matches`);
      savedCount += webMatches.length;
    }
    
    console.log(`[WEB-SEARCH] Total matches saved: ${savedCount}`);

    // Calculate batch progress
    const totalProcessed = batchOffset + unmatchedStoreItems.length;
    const hasMore = remainingAfterBatch > 0;
    const nextOffset = hasMore ? batchOffset + batchSize : null;
    
    // Estimate cost (rough: ~$0.01 per item for Perplexity)
    const estimatedCost = (unmatchedStoreItems.length * 0.01).toFixed(2);
    const totalEstimatedCost = (allUnmatchedItems.length * 0.01).toFixed(2);
    
    return NextResponse.json({
      success: true,
      message: `Created ${savedCount} web search match candidates in this batch`,
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
    console.error('[WEB-SEARCH] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to run web search matching' },
      { status: 500 }
    );
  }
}
