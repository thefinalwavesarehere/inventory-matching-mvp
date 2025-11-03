import { NextRequest, NextResponse } from 'next/server';
import { matchPartsSemanticOnly, batchSemanticMatch } from '../../lib/ai/semanticMatching';
import prisma from '../../lib/db/prisma';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, arnoldItemId, supplierItemId, batchItems } = body;

    // Check if OpenAI API key is configured
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured. Please add OPENAI_API_KEY to environment variables.' },
        { status: 500 }
      );
    }

    if (action === 'single') {
      // Match a single pair of parts
      if (!arnoldItemId || !supplierItemId) {
        return NextResponse.json(
          { error: 'arnoldItemId and supplierItemId are required for single action' },
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

      // Use AI semantic matching
      const result = await matchPartsSemanticOnly({
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
            matchStage: 'ai_semantic',
            confidenceScore: result.confidence,
            matchReasons: {
              method: 'ai_semantic_match',
              reasoning: result.reasoning,
              partNumberSimilarity: result.partNumberSimilarity,
              nameSimilarity: result.nameSimilarity,
              descriptionSimilarity: result.descriptionSimilarity,
            },
            status: result.isMatch && result.confidence > 0.7 ? 'confirmed' : 'pending',
          },
        });
      } else {
        await prisma.matchResult.create({
          data: {
            arnoldItemId,
            supplierItemId,
            matchStage: 'ai_semantic',
            confidenceScore: result.confidence,
            matchReasons: {
              method: 'ai_semantic_match',
              reasoning: result.reasoning,
              partNumberSimilarity: result.partNumberSimilarity,
              nameSimilarity: result.nameSimilarity,
              descriptionSimilarity: result.descriptionSimilarity,
            },
            status: result.isMatch && result.confidence > 0.7 ? 'confirmed' : 'pending',
          },
        });
      }

      return NextResponse.json({
        success: true,
        data: result,
      });
    } else if (action === 'batch') {
      // Batch process multiple parts
      if (!batchItems || !Array.isArray(batchItems)) {
        return NextResponse.json(
          { error: 'batchItems array is required for batch action' },
          { status: 400 }
        );
      }

      // Fetch all items from database
      const arnoldIds = batchItems.map((item: any) => item.arnoldItemId);
      const supplierIds = batchItems.map((item: any) => item.supplierItemId);

      const arnoldItems = await prisma.arnoldInventory.findMany({
        where: { id: { in: arnoldIds } },
      });

      const supplierItems = await prisma.supplierCatalog.findMany({
        where: { id: { in: supplierIds } },
      });

      // Create input array for batch processing
      const inputs = batchItems.map((item: any) => {
        const arnold = arnoldItems.find((a: any) => a.id === item.arnoldItemId);
        const supplier = supplierItems.find((s: any) => s.id === item.supplierItemId);

        if (!arnold || !supplier) {
          return null;
        }

        return {
          arnoldPartNumber: arnold.partNumber,
          arnoldDescription: (arnold.rawData as any)?.Description,
          supplierPartNumber: supplier.partNumber,
          supplierDescription: supplier.description || undefined,
          supplierLineCode: supplier.lineCode,
          arnoldItemId: arnold.id,
          supplierItemId: supplier.id,
        };
      }).filter((item: any) => item !== null) as any[];

      // Process in batches with rate limiting
      const results = await batchSemanticMatch(inputs, {
        delayMs: 100, // 100ms delay = max 10 requests/second
      });

      // Save all results to database
      for (const result of results) {
        const arnoldItemId = (result.input as any).arnoldItemId;
        const supplierItemId = (result.input as any).supplierItemId;

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
              matchStage: 'ai_semantic',
              confidenceScore: result.confidence,
              matchReasons: {
                method: 'ai_semantic_match',
                reasoning: result.reasoning,
                partNumberSimilarity: result.partNumberSimilarity,
                nameSimilarity: result.nameSimilarity,
                descriptionSimilarity: result.descriptionSimilarity,
              },
              status: result.isMatch && result.confidence > 0.7 ? 'confirmed' : 'pending',
            },
          });
        } else {
          await prisma.matchResult.create({
            data: {
              arnoldItemId,
              supplierItemId,
              matchStage: 'ai_semantic',
              confidenceScore: result.confidence,
              matchReasons: {
                method: 'ai_semantic_match',
                reasoning: result.reasoning,
                partNumberSimilarity: result.partNumberSimilarity,
                nameSimilarity: result.nameSimilarity,
                descriptionSimilarity: result.descriptionSimilarity,
              },
              status: result.isMatch && result.confidence > 0.7 ? 'confirmed' : 'pending',
            },
          });
        }
      }

      return NextResponse.json({
        success: true,
        processed: results.length,
        data: results,
      });
    } else {
      return NextResponse.json(
        { error: 'Invalid action. Must be "single" or "batch"' },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error('Error in semantic matching:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to perform semantic matching' },
      { status: 500 }
    );
  }
}
