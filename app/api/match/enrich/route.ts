/**
 * Web Scraping Enhancement API
 * POST /api/match/enrich - Search web for part details and enrich matches
 */

import { NextRequest, NextResponse } from 'next/server';
// Migrated to Supabase auth
import { requireAuth } from '@/app/lib/auth-helpers';
import prisma from '@/app/lib/db/prisma';
import OpenAI from 'openai';

const perplexity = new OpenAI({
  apiKey: process.env.PERPLEXITY_API_KEY,
  baseURL: 'https://api.perplexity.ai',
});

export async function POST(req: NextRequest) {
  try {
    // Require authentication
    await requireAuth();

    const body = await req.json();
    const { matchIds } = body;

    if (!matchIds || !Array.isArray(matchIds) || matchIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Match IDs array required' },
        { status: 400 }
      );
    }

    console.log(`[ENRICH] Starting web enrichment for ${matchIds.length} matches`);

    // Get matches with their store items
    const matches = await prisma.matchCandidate.findMany({
      where: {
        id: { in: matchIds },
      },
      include: {
        storeItem: true,
      },
    });

    console.log(`[ENRICH] Found ${matches.length} matches to enrich`);

    let enrichedCount = 0;
    const enrichmentResults: any[] = [];

    for (const match of matches) {
      try {
        // Get supplier item if this is a supplier match
        let partNumber = match.storeItem.partNumber;
        if (match.targetType === 'SUPPLIER') {
          const supplierItem = await prisma.supplierItem.findUnique({
            where: { id: match.targetId },
          });
          if (supplierItem) {
            partNumber = supplierItem.partNumber;
          }
        }
        
        console.log(`[ENRICH] Searching for part: ${partNumber}`);

        const searchQuery = `${partNumber} automotive part price specifications`;
        const searchResults = await searchWeb(partNumber, searchQuery);
        
        if (searchResults && searchResults.found) {
          enrichmentResults.push({
            matchId: match.id,
            partNumber,
            ...searchResults,
          });

          // Update match with enriched data
          const existingFeatures = match.features as any || {};
          await prisma.matchCandidate.update({
            where: { id: match.id },
            data: {
              features: {
                ...existingFeatures,
                webEnriched: true,
                webData: searchResults,
                enrichedAt: new Date().toISOString(),
              },
            },
          });
          
          enrichedCount++;
        }

        // Rate limiting - avoid overwhelming servers
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error: any) {
        console.error(`[ENRICH] Error enriching ${match.id}:`, error.message);
        continue;
      }
    }

    console.log(`[ENRICH] Enriched ${enrichedCount} matches`);

    return NextResponse.json({
      success: true,
      message: `Enriched ${enrichedCount} matches with web data`,
      enrichedCount,
      results: enrichmentResults,
    });
  } catch (error: any) {
    console.error('[ENRICH] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to enrich matches' },
      { status: 500 }
    );
  }
}

/**
 * Search the web for part information using Perplexity AI
 */
async function searchWeb(partNumber: string, query: string): Promise<any | null> {
  try {
    console.log(`[SEARCH] Searching for: ${query}`);
    
    const prompt = `Find information about this automotive part: ${partNumber}

Please search for and provide:
1. Part description
2. Current market price (if available)
3. Specifications
4. Compatible vehicles or applications
5. Source URL where this information was found

Respond in JSON format:
{
  "found": true/false,
  "description": "...",
  "price": "$XX.XX" or null,
  "specifications": "...",
  "applications": "...",
  "sourceUrl": "https://...",
  "sources": ["site1.com", "site2.com"]
}`;

    const response = await perplexity.chat.completions.create({
      model: 'sonar-pro',
      messages: [
        {
          role: 'system',
          content: 'You are an automotive parts research assistant. Search the web for accurate part information and respond with valid JSON only.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.2,
      max_tokens: 1000,
    });

    let responseText = response.choices[0]?.message?.content?.trim();
    if (!responseText) return null;

    // Remove markdown code blocks if present
    responseText = responseText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

    // Parse response
    const result = JSON.parse(responseText);
    
    console.log(`[SEARCH] Found: ${result.found ? 'YES' : 'NO'}`);
    
    return result;
  } catch (error: any) {
    console.error(`[SEARCH] Error:`, error.message);
    return null;
  }
}
