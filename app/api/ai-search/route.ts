import { NextRequest, NextResponse } from 'next/server';
import { searchPartWithAgent, matchPartsWithAgent } from '../../lib/ai/agentMatching';
import prisma from '../../lib/db/prisma';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, arnoldItemId, supplierItemId, partNumber, partName, description } = body;

    // Check if OpenAI API key is configured
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured. Please add OPENAI_API_KEY to environment variables.' },
        { status: 500 }
      );
    }

    if (action === 'search') {
      // Search for information about a specific part
      if (!partNumber) {
        return NextResponse.json(
          { error: 'partNumber is required for search action' },
          { status: 400 }
        );
      }

      const result = await searchPartWithAgent(partNumber, partName, description);

      // If we have an arnoldItemId, save the search results
      if (arnoldItemId && result.suggestedMatches.length > 0) {
        // Create match results for suggested matches
        for (const match of result.suggestedMatches) {
          // Try to find the supplier item in our database
          const supplierItem = await prisma.supplierCatalog.findFirst({
            where: {
              OR: [
                { partFull: match.partNumber },
                { partNumber: match.partNumber },
              ],
            },
          });

          // Create a match result
          await prisma.matchResult.create({
            data: {
              arnoldItemId,
              supplierItemId: supplierItem?.id || null,
              matchStage: 'web_search',
              confidenceScore: match.confidence,
              matchReasons: {
                method: 'ai_web_search',
                source: match.source,
                description: match.description,
                additionalInfo: result.additionalInfo,
              },
              status: 'pending',
            },
          });

          // If we found a supplier item, create enrichment data
          if (supplierItem && match.description) {
            const matchResult = await prisma.matchResult.findFirst({
              where: {
                arnoldItemId,
                supplierItemId: supplierItem.id,
              },
              orderBy: { createdAt: 'desc' },
            });

            if (matchResult) {
              await prisma.enrichmentData.create({
                data: {
                  matchId: matchResult.id,
                  fieldName: 'description',
                  fieldValue: match.description,
                  source: 'ai',
                  confidence: match.confidence,
                },
              });
            }
          }
        }
      }

      return NextResponse.json({
        success: true,
        data: result,
      });
    } else if (action === 'match') {
      // Compare two specific parts
      if (!arnoldItemId || !supplierItemId) {
        return NextResponse.json(
          { error: 'arnoldItemId and supplierItemId are required for match action' },
          { status: 400 }
        );
      }

      // Fetch the items from database
      const arnoldItem = await prisma.arnoldInventory.findUnique({
        where: { id: arnoldItemId },
      });

      const supplierItem = await prisma.supplierCatalog.findUnique({
        where: { id: supplierItemId },
      });

      if (!arnoldItem || !supplierItem) {
        return NextResponse.json(
          { error: 'Items not found' },
          { status: 404 }
        );
      }

      // Use AI agent to match
      const result = await matchPartsWithAgent({
        arnoldPartNumber: arnoldItem.partNumber,
        arnoldDescription: (arnoldItem.rawData as any)?.Description,
        supplierPartNumber: supplierItem.partNumber,
        supplierDescription: supplierItem.description || undefined,
        supplierLineCode: supplierItem.lineCode,
      });

      // Update or create match result
      const existingMatch = await prisma.matchResult.findFirst({
        where: {
          arnoldItemId,
          supplierItemId,
        },
      });

      if (existingMatch) {
        await prisma.matchResult.update({
          where: { id: existingMatch.id },
          data: {
            matchStage: 'web_search',
            confidenceScore: result.confidence,
            matchReasons: {
              method: 'ai_agent_match',
              reasoning: result.reasoning,
              suggestedMatch: result.suggestedMatch,
              additionalInfo: result.additionalInfo,
            },
            status: result.isMatch && result.confidence > 0.7 ? 'confirmed' : 'pending',
          },
        });
      } else {
        await prisma.matchResult.create({
          data: {
            arnoldItemId,
            supplierItemId,
            matchStage: 'web_search',
            confidenceScore: result.confidence,
            matchReasons: {
              method: 'ai_agent_match',
              reasoning: result.reasoning,
              suggestedMatch: result.suggestedMatch,
              additionalInfo: result.additionalInfo,
            },
            status: result.isMatch && result.confidence > 0.7 ? 'confirmed' : 'pending',
          },
        });
      }

      return NextResponse.json({
        success: true,
        data: result,
      });
    } else {
      return NextResponse.json(
        { error: 'Invalid action. Must be "search" or "match"' },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error('Error in AI search:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to perform AI search' },
      { status: 500 }
    );
  }
}
