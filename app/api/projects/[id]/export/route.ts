import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/lib/db/prisma';
import { stringify } from 'csv-stringify';

/**
 * Epic A1.2 - Excel Export Endpoint
 * 
 * Generates a CSV file for Excel review with all match candidates for a project.
 * Uses streaming to handle large datasets efficiently.
 * 
 * Endpoint: GET /api/projects/:id/export
 * 
 * CSV Columns (strict order):
 * - match_id: Stable key for re-import
 * - project_id: Project identifier
 * - status: PENDING, CONFIRMED, REJECTED
 * - method: Match method used
 * - confidence: Match confidence score
 * - store_part_number, store_line_code, store_description
 * - supplier_part_number, supplier_line_code, supplier_description
 * - vendor_action: Current DB value (NONE, LIFT, REBOX, UNKNOWN, CONTACT_VENDOR)
 * - review_decision: Blank for user to fill (unless already ACCEPTED/REJECTED)
 * - corrected_supplier_part: Blank or existing override
 */

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const projectId = params.id;

    console.log(`[EXPORT] Starting CSV export for project: ${projectId}`);

    // Verify project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true },
    });

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    // Create CSV stringifier with streaming support
    const stringifier = stringify({
      header: true,
      columns: [
        { key: 'match_id', header: 'match_id' },
        { key: 'project_id', header: 'project_id' },
        { key: 'status', header: 'status' },
        { key: 'method', header: 'method' },
        { key: 'confidence', header: 'confidence' },
        { key: 'store_part_number', header: 'store_part_number' },
        { key: 'store_line_code', header: 'store_line_code' },
        { key: 'store_description', header: 'store_description' },
        { key: 'supplier_part_number', header: 'supplier_part_number' },
        { key: 'supplier_line_code', header: 'supplier_line_code' },
        { key: 'supplier_description', header: 'supplier_description' },
        { key: 'vendor_action', header: 'vendor_action' },
        { key: 'review_decision', header: 'review_decision' },
        { key: 'corrected_supplier_part', header: 'corrected_supplier_part' },
      ],
    });

    // Fetch matches in batches to avoid memory issues
    const BATCH_SIZE = 1000;
    let offset = 0;
    let totalExported = 0;

    // Start streaming
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Write CSV data in batches
          while (true) {
            const matches = await prisma.matchCandidate.findMany({
              where: { projectId },
              include: {
                storeItem: {
                  select: {
                    partNumber: true,
                    lineCode: true,
                    description: true,
                  },
                },
              },
              orderBy: [
                { status: 'asc' }, // PENDING first, then CONFIRMED, then REJECTED
                { confidence: 'desc' }, // High confidence first
              ],
              skip: offset,
              take: BATCH_SIZE,
            });

            if (matches.length === 0) {
              break; // No more data
            }

            // Get supplier items for this batch
            const supplierItemIds = matches
              .filter(m => m.targetType === 'SUPPLIER' && !m.targetId.startsWith('WEB_'))
              .map(m => m.targetId);

            const supplierItems = await prisma.supplierItem.findMany({
              where: {
                id: { in: supplierItemIds },
              },
              select: {
                id: true,
                partNumber: true,
                lineCode: true,
                description: true,
              },
            });

            const supplierItemsMap = new Map(
              supplierItems.map(item => [item.id, item])
            );

            // Transform matches to CSV rows
            for (const match of matches) {
              const storeItem = match.storeItem;
              
              // Get supplier data
              let supplierPartNumber = '';
              let supplierLineCode = '';
              let supplierDescription = '';

              if (match.targetType === 'SUPPLIER') {
                const supplierItem = supplierItemsMap.get(match.targetId);
                if (supplierItem) {
                  supplierPartNumber = supplierItem.partNumber || '';
                  supplierLineCode = supplierItem.lineCode || '';
                  supplierDescription = supplierItem.description || '';
                }
              } else if (match.targetType === 'INVENTORY') {
                // For inventory matches, fetch the inventory item
                const inventoryItem = await prisma.inventoryItem.findUnique({
                  where: { id: match.targetId },
                  select: {
                    partNumber: true,
                    lineCode: true,
                    description: true,
                  },
                });
                if (inventoryItem) {
                  supplierPartNumber = inventoryItem.partNumber || '';
                  supplierLineCode = inventoryItem.lineCode || '';
                  supplierDescription = inventoryItem.description || '';
                }
              }

              // Determine review_decision value
              // Leave blank for PENDING, fill with status for CONFIRMED/REJECTED
              let reviewDecision = '';
              if (match.status === 'CONFIRMED') {
                reviewDecision = 'ACCEPTED';
              } else if (match.status === 'REJECTED') {
                reviewDecision = 'REJECTED';
              }
              // PENDING stays blank for user to fill in

              // Format confidence as percentage
              const confidencePercent = (match.confidence * 100).toFixed(1);

              const row = {
                match_id: match.id,
                project_id: match.projectId,
                status: match.status,
                method: match.method,
                confidence: confidencePercent,
                store_part_number: storeItem.partNumber || '',
                store_line_code: storeItem.lineCode || '',
                store_description: storeItem.description || '',
                supplier_part_number: supplierPartNumber,
                supplier_line_code: supplierLineCode,
                supplier_description: supplierDescription,
                vendor_action: match.vendorAction || 'NONE',
                review_decision: reviewDecision,
                corrected_supplier_part: match.correctedSupplierPartNumber || '',
              };

              // Write row to stringifier
              stringifier.write(row);
              totalExported++;
            }

            offset += BATCH_SIZE;

            // Log progress
            if (totalExported % 1000 === 0) {
              console.log(`[EXPORT] Exported ${totalExported} matches...`);
            }
          }

          // End the stringifier
          stringifier.end();

          // Convert Node.js stream to Web Stream
          // Iterate through the stringifier output
          for await (const chunk of stringifier) {
            const encoded = typeof chunk === 'string' 
              ? new TextEncoder().encode(chunk) 
              : chunk;
            controller.enqueue(encoded);
          }

          controller.close();
          console.log(`[EXPORT] Completed. Total exported: ${totalExported} matches`);
        } catch (error) {
          console.error('[EXPORT] Stream error:', error);
          controller.error(error);
        }
      },
    });

    // Generate filename with project name and date
    const projectName = project.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `${projectName}_matches_${dateStr}.csv`;

    // Return streaming response
    return new NextResponse(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache',
      },
    });

  } catch (error: any) {
    console.error('[EXPORT] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to export matches' },
      { status: 500 }
    );
  }
}
