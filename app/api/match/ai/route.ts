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
    const { projectId, limit = 50 } = body;

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

    const unmatchedStoreItems = await prisma.storeItem.findMany({
      where: {
        projectId,
        id: { notIn: Array.from(matchedIds) },
      },
      take: limit,
      orderBy: { partNumber: 'asc' },
    });

    const supplierItems = await prisma.supplierItem.findMany({
      where: { projectId },
    });

    console.log(`[AI-MATCH] Processing ${unmatchedStoreItems.length} unmatched items`);
    console.log(`[AI-MATCH] Against ${supplierItems.length} supplier items`);

    const aiMatches: any[] = [];

    // Process in batches of 10
    for (let i = 0; i < unmatchedStoreItems.length; i += 10) {
      const batch = unmatchedStoreItems.slice(i, i + 10);
      
      for (const storeItem of batch) {
        try {
          // Create prompt for AI
          const prompt = `You are an automotive parts matching expert. Match this store inventory item to the most likely supplier part.

Store Item:
- Part Number: ${storeItem.partNumber}
- Description: ${storeItem.description || 'N/A'}
- Line Code: ${storeItem.lineCode || 'N/A'}

Supplier Catalog (first 100 items):
${supplierItems.slice(0, 100).map((s, idx) => `${idx + 1}. ${s.partNumber}${s.description ? ` - ${s.description}` : ''}`).join('\n')}

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

          const responseText = completion.choices[0]?.message?.content?.trim();
          if (!responseText) continue;

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

      // Small delay between batches to avoid rate limits
      if (i + 10 < unmatchedStoreItems.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    // Save AI matches
    if (aiMatches.length > 0) {
      await prisma.matchCandidate.createMany({
        data: aiMatches,
      });
      console.log(`[AI-MATCH] Saved ${aiMatches.length} AI-powered matches`);
    }

    return NextResponse.json({
      success: true,
      message: `Created ${aiMatches.length} AI-powered match candidates`,
      matchCount: aiMatches.length,
      processed: unmatchedStoreItems.length,
    });
  } catch (error: any) {
    console.error('[AI-MATCH] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to run AI matching' },
      { status: 500 }
    );
  }
}
