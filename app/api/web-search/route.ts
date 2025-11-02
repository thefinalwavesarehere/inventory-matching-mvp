import { NextRequest, NextResponse } from 'next/server';
import { searchPartOnWeb, matchUnmatchedPartsWithWebSearch } from '../../lib/ml/webSearchMatching';
import prisma from '../../lib/db/prisma';

/**
 * POST endpoint to trigger web search for unmatched parts
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, partNumber, arnoldItemId, limit } = body;

    // Option 1: Search for a specific part
    if (partNumber || arnoldItemId) {
      let targetPartNumber = partNumber;
      let targetArnoldItemId = arnoldItemId;
      let description: string | null = null;
      let lineCode: string | null = null;

      // If arnoldItemId is provided, fetch the item
      if (arnoldItemId) {
        const arnoldItem = await prisma.arnoldInventory.findUnique({
          where: { id: arnoldItemId },
        });

        if (!arnoldItem) {
          return NextResponse.json(
            { error: 'Arnold item not found' },
            { status: 404 }
          );
        }

        targetPartNumber = arnoldItem.partNumber;
        targetArnoldItemId = arnoldItem.id;

        // Try to get description from inventory report
        const inventoryItem = await prisma.supplierCatalog.findFirst({
          where: {
            supplierName: 'Arnold Inventory Report',
            partNumber: arnoldItem.partNumber.replace(/^[A-Z]+/, ''),
          },
        });

        description = inventoryItem?.description || null;
        lineCode = arnoldItem.partNumber.match(/^([A-Z]+)/)?.[1] || null;
      }

      // Perform web search
      const searchResult = await searchPartOnWeb(targetPartNumber, description, lineCode);

      // If arnoldItemId is provided, create a match result with web_search stage
      if (targetArnoldItemId && searchResult.potentialMatches.length > 0) {
        // Create a match result for the first potential match
        const topMatch = searchResult.potentialMatches[0];
        
        await prisma.matchResult.create({
          data: {
            arnoldItemId: targetArnoldItemId,
            supplierItemId: null, // No direct supplier match yet
            matchStage: 'web_search',
            confidenceScore: topMatch.confidence,
            matchReasons: [
              `Web search found: ${searchResult.description || 'No description'}`,
              `Manufacturer: ${searchResult.manufacturer || 'Unknown'}`,
              `Potential match: ${topMatch.partNumber} from ${topMatch.source}`,
            ],
            status: 'pending',
          },
        });
      }

      return NextResponse.json({
        success: true,
        searchResult,
      });
    }

    // Option 2: Batch search for all unmatched parts in a project
    if (projectId) {
      const results = await matchUnmatchedPartsWithWebSearch(projectId, limit || 10);

      // Create match results for items with suggested matches
      for (const result of results) {
        if (result.suggestedMatches.length > 0) {
          const topMatch = result.suggestedMatches[0];

          await prisma.matchResult.create({
            data: {
              arnoldItemId: result.arnoldItemId,
              supplierItemId: topMatch.supplierItems[0]?.id || null,
              matchStage: 'web_search',
              confidenceScore: topMatch.confidence,
              matchReasons: [
                `Web search found: ${result.searchResult.description || 'No description'}`,
                `Matched via web search to: ${topMatch.webSearchMatch.partNumber}`,
              ],
              status: 'pending',
            },
          });
        }
      }

      return NextResponse.json({
        success: true,
        message: `Processed ${results.length} unmatched parts`,
        results,
      });
    }

    return NextResponse.json(
      { error: 'Either projectId, partNumber, or arnoldItemId is required' },
      { status: 400 }
    );

  } catch (error) {
    console.error('Web search error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to perform web search',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint to retrieve web search results
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');

    if (!projectId) {
      return NextResponse.json(
        { error: 'Project ID is required' },
        { status: 400 }
      );
    }

    // Get all match results from web search stage
    const webSearchMatches = await prisma.matchResult.findMany({
      where: {
        matchStage: 'web_search',
        arnoldItem: {
          session: {
            projectId,
          },
        },
      },
      include: {
        arnoldItem: true,
        supplierItem: true,
      },
      orderBy: {
        confidenceScore: 'desc',
      },
    });

    return NextResponse.json({
      success: true,
      count: webSearchMatches.length,
      matches: webSearchMatches,
    });

  } catch (error) {
    console.error('Error fetching web search results:', error);
    return NextResponse.json(
      { error: 'Failed to fetch web search results' },
      { status: 500 }
    );
  }
}
