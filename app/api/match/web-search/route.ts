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

    const webMatches: any[] = [];

    // Process each unmatched item
    for (const storeItem of unmatchedStoreItems) {
      try {
        // Create prompt for Perplexity to search the web
        const prompt = `Search the web for this automotive part and find the best matching supplier part number.

Store Part:
- Part Number: ${storeItem.partNumber}
- Description: ${storeItem.description || 'N/A'}
- Line Code: ${storeItem.lineCode || 'N/A'}

Task: Find a matching automotive part from any supplier (RockAuto, AutoZone, O'Reilly, NAPA, etc.)

Respond with ONLY a JSON object in this exact format:
{
  "match": true/false,
  "supplierPartNumber": "PART123" or null,
  "supplierName": "Company Name" or null,
  "confidence": 0.0-1.0,
  "description": "Part description",
  "price": "$XX.XX" or null,
  "sourceUrl": "https://..." or null,
  "reason": "Brief explanation"
}`;

        const response = await perplexity.chat.completions.create({
          model: 'llama-3.1-sonar-large-128k-online',
          messages: [
            {
              role: 'system',
              content: 'You are an automotive parts research assistant. Search the web for matching parts and respond with valid JSON only.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.2,
          max_tokens: 500,
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
            method: 'WEB_SEARCH',
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
        }

        // Rate limiting - 1 second between requests
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error: any) {
        console.error(`[WEB-SEARCH] Error processing ${storeItem.partNumber}:`, error.message);
        continue;
      }
    }

    // Save web search matches
    if (webMatches.length > 0) {
      await prisma.matchCandidate.createMany({
        data: webMatches,
      });
      console.log(`[WEB-SEARCH] Saved ${webMatches.length} web search matches`);
    }

    // Calculate batch progress
    const totalProcessed = batchOffset + unmatchedStoreItems.length;
    const hasMore = remainingAfterBatch > 0;
    const nextOffset = hasMore ? batchOffset + batchSize : null;
    
    // Estimate cost (rough: ~$0.01 per item for Perplexity)
    const estimatedCost = (unmatchedStoreItems.length * 0.01).toFixed(2);
    const totalEstimatedCost = (allUnmatchedItems.length * 0.01).toFixed(2);
    
    return NextResponse.json({
      success: true,
      message: `Created ${webMatches.length} web search match candidates in this batch`,
      matchCount: webMatches.length,
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
