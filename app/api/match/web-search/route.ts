/**
 * Web Search Matching API
 * POST /api/match/web-search - Use Perplexity to search web for unmatched parts
 */

import { NextRequest, NextResponse } from 'next/server';
// Migrated to Supabase auth
import { requireAuth } from '@/app/lib/auth-helpers';
import prisma from '@/app/lib/db/prisma';
import OpenAI from 'openai';

// Use OpenAI instead of Perplexity for better results
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    // Require authentication
    await requireAuth();

    const body = await req.json();
    const { projectId, batchOffset = 0, batchSize = 20 } = body;

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

        const prompt = `You are an automotive parts expert. Find the BEST match for this store part from our supplier catalog.

MATCHING EXAMPLES:
✓ MATCH: "AELAC488" matches "AC488" (line code stripped)
✓ MATCH: "ABC-123" matches "ABC123" (punctuation removed)
✓ MATCH: "LTG-G6002" matches "LTGG6002" (punctuation removed)
✓ MATCH: "ABH8865" matches "BAT08865" (different line code, same core)
✗ NO MATCH: "ABC12345" vs "ABC54321" (different core numbers)

Store Part to Match:
- Part: ${storeItem.partNumber}
- Desc: ${storeItem.description || 'N/A'}
- Line: ${storeItem.lineCode || 'N/A'}
- Mfr: ${storeItem.mfrPartNumber || 'N/A'}${catalogContext}

MATCHING RULES:
1. **Check supplier catalog ONLY** - do not search the web
2. **Punctuation doesn't matter**: ABC-123 = ABC.123 = ABC 123 = ABC123
3. **Line codes can differ**: AELAC488 = AC488 (focus on core numbers)
4. **60%+ similarity is acceptable**: Minor differences are OK
5. **When in doubt, MATCH IT** - be generous

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
              content: 'You are an expert automotive parts matcher. Match parts from the supplier catalog only. Be generous - 60%+ similarity is acceptable. Always respond with valid JSON only.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.3,  // Lower for more consistent matching
          max_tokens: 250,
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
          // Fill in missing fields for catalog-only matches
          if (!webResponse.supplierName) webResponse.supplierName = 'Supplier Catalog';
          if (!webResponse.description) webResponse.description = null;
          if (!webResponse.price) webResponse.price = null;
          if (!webResponse.sourceUrl) webResponse.sourceUrl = null;
          console.log(`[WEB-SEARCH] Found match: ${storeItem.partNumber} -> ${webResponse.supplierPartNumber} (${webResponse.confidence})`);

          // Find or create supplier item for web-found match
          // First check if this supplier part already exists
          let supplierItem = supplierItems.find(
            (s) => s.partNumber === webResponse.supplierPartNumber
          );
          
          if (supplierItem) {
            // Match found in existing supplier catalog
            webMatches.push({
              projectId,
              storeItemId: storeItem.id,
              targetType: 'SUPPLIER',
              targetId: supplierItem.id,
              method: 'WEB_SEARCH' as any,  // Cast to any to bypass enum check
              confidence: webResponse.confidence,
              matchStage: 4,  // Web search is stage 4
              features: {
                webSearch: true,
                supplierName: webResponse.supplierName,
                description: webResponse.description,
                price: webResponse.price,
                sourceUrl: webResponse.sourceUrl,
                reason: webResponse.reason,
              },
              status: 'PENDING',
            });
          } else {
            // Create new supplier item from web search result
            const newSupplierItem = await prisma.supplierItem.create({
              data: {
                projectId,
                supplier: webResponse.supplierName || 'Web Search',
                partNumber: webResponse.supplierPartNumber,
                partFull: webResponse.supplierPartNumber,
                partNumberNorm: webResponse.supplierPartNumber.toLowerCase(),
                canonicalPartNumber: webResponse.supplierPartNumber.replace(/[-\/\.\s]/g, '').toUpperCase(),
                description: webResponse.description || null,
                currentCost: webResponse.price ? parseFloat(webResponse.price.replace(/[^0-9.]/g, '')) : null,
                rawData: {
                  source: 'web_search',
                  url: webResponse.sourceUrl,
                },
              },
            });
            
            webMatches.push({
              projectId,
              storeItemId: storeItem.id,
              targetType: 'SUPPLIER',
              targetId: newSupplierItem.id,
              method: 'WEB_SEARCH' as any,
              confidence: webResponse.confidence,
              matchStage: 4,
              features: {
                webSearch: true,
                supplierName: webResponse.supplierName,
                description: webResponse.description,
                price: webResponse.price,
                sourceUrl: webResponse.sourceUrl,
                reason: webResponse.reason,
              },
              status: 'PENDING',
            });
          }
          
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
