import { NextRequest, NextResponse } from 'next/server';
import { enrichPartData, batchEnrichData, identifyMissingFields } from '../../lib/ai/dataEnrichment';
import prisma from '../../lib/db/prisma';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, matchId, projectId } = body;

    // Check if OpenAI API key is configured
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured. Please add OPENAI_API_KEY to environment variables.' },
        { status: 500 }
      );
    }

    if (action === 'single') {
      // Enrich a single match
      if (!matchId) {
        return NextResponse.json(
          { error: 'matchId is required for single action' },
          { status: 400 }
        );
      }

      // Fetch the match with related items
      const match = await prisma.matchResult.findUnique({
        where: { id: matchId },
        include: {
          arnoldItem: true,
          supplierItem: true,
        },
      });

      if (!match) {
        return NextResponse.json(
          { error: 'Match not found' },
          { status: 404 }
        );
      }

      // Identify missing fields
      const supplierItem = match.supplierItem;
      if (!supplierItem) {
        return NextResponse.json(
          { error: 'No supplier item found for this match' },
          { status: 400 }
        );
      }

      const missingFields = identifyMissingFields(supplierItem);

      if (missingFields.length === 0) {
        return NextResponse.json({
          success: true,
          message: 'No missing fields found',
          data: { found: false, data: {}, sources: [], confidence: 1, notes: 'All fields present' },
        });
      }

      // Use AI to find missing data
      const result = await enrichPartData({
        partNumber: supplierItem.partNumber,
        lineCode: supplierItem.lineCode,
        description: supplierItem.description || undefined,
        missingFields,
      });

      // Save enrichment data to database
      if (result.found && Object.keys(result.data).length > 0) {
        for (const [fieldName, fieldValue] of Object.entries(result.data)) {
          if (fieldValue !== null && fieldValue !== undefined) {
            await prisma.enrichmentData.create({
              data: {
                matchId: match.id,
                fieldName,
                fieldValue: String(fieldValue),
                source: 'ai',
                confidence: result.confidence,
              },
            });
          }
        }

        // Update supplier item with enriched data
        const updateData: any = {};
        if (result.data.price) updateData.cost = result.data.price;
        if (result.data.cost) updateData.cost = result.data.cost;
        if (result.data.description) updateData.description = result.data.description;
        
        const rawData = (supplierItem.rawData as any) || {};
        if (result.data.qtyPerBox) rawData.qtyPerBox = result.data.qtyPerBox;
        if (result.data.boxSize) rawData.boxSize = result.data.boxSize;
        if (result.data.qtyPerBox || result.data.boxSize) updateData.rawData = rawData;

        if (Object.keys(updateData).length > 0) {
          await prisma.supplierCatalog.update({
            where: { id: supplierItem.id },
            data: updateData,
          });
        }
      }

      return NextResponse.json({
        success: true,
        data: result,
      });
    } else if (action === 'batch') {
      // Batch enrich all confirmed matches in a project
      if (!projectId) {
        return NextResponse.json(
          { error: 'projectId is required for batch action' },
          { status: 400 }
        );
      }

      // Fetch all confirmed matches with missing data
      const matches = await prisma.matchResult.findMany({
        where: {
          arnoldItem: {
            sessionId: {
              in: (await prisma.uploadSession.findMany({
                where: { projectId },
                select: { id: true },
              })).map((s: any) => s.id),
            },
          },
          status: 'confirmed',
        },
        include: {
          arnoldItem: true,
          supplierItem: true,
        },
      });

      // Filter matches with missing data
      const matchesNeedingEnrichment = matches.filter((match: any) => {
        if (!match.supplierItem) return false;
        const missingFields = identifyMissingFields(match.supplierItem);
        return missingFields.length > 0;
      });

      if (matchesNeedingEnrichment.length === 0) {
        return NextResponse.json({
          success: true,
          message: 'No matches need enrichment',
          processed: 0,
        });
      }

      // Create enrichment inputs
      const inputs = matchesNeedingEnrichment.map((match: any) => ({
        partNumber: match.supplierItem.partNumber,
        lineCode: match.supplierItem.lineCode,
        description: match.supplierItem.description || undefined,
        missingFields: identifyMissingFields(match.supplierItem),
        matchId: match.id,
        supplierItemId: match.supplierItem.id,
      }));

      // Process with rate limiting
      const results = await batchEnrichData(inputs, {
        delayMs: 200, // 200ms delay between requests
      });

      // Save all enrichment data
      let enrichedCount = 0;
      for (const result of results) {
        if (!result.found || Object.keys(result.data).length === 0) continue;

        const matchId = (result.input as any).matchId;
        const supplierItemId = (result.input as any).supplierItemId;

        // Save enrichment data
        for (const [fieldName, fieldValue] of Object.entries(result.data)) {
          if (fieldValue !== null && fieldValue !== undefined) {
            await prisma.enrichmentData.create({
              data: {
                matchId,
                fieldName,
                fieldValue: String(fieldValue),
                source: 'ai',
                confidence: result.confidence,
              },
            });
          }
        }

        // Update supplier item
        const supplierItem = await prisma.supplierCatalog.findUnique({
          where: { id: supplierItemId },
        });

        if (supplierItem) {
          const updateData: any = {};
          if (result.data.price) updateData.cost = result.data.price;
          if (result.data.cost) updateData.cost = result.data.cost;
          if (result.data.description) updateData.description = result.data.description;
          
          const rawData = supplierItem.rawData as any || {};
          if (result.data.qtyPerBox) rawData.qtyPerBox = result.data.qtyPerBox;
          if (result.data.boxSize) rawData.boxSize = result.data.boxSize;
          if (Object.keys(rawData).length > 0) updateData.rawData = rawData;

          if (Object.keys(updateData).length > 0) {
            await prisma.supplierCatalog.update({
              where: { id: supplierItemId },
              data: updateData,
            });
            enrichedCount++;
          }
        }
      }

      return NextResponse.json({
        success: true,
        processed: results.length,
        enriched: enrichedCount,
        data: results,
      });
    } else {
      return NextResponse.json(
        { error: 'Invalid action. Must be "single" or "batch"' },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error('Error in data enrichment:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to perform data enrichment' },
      { status: 500 }
    );
  }
}
