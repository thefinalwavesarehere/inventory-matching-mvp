import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/lib/db/prisma';

export const dynamic = 'force-dynamic';

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

    // Helper function to escape CSV fields
    const escapeCsvField = (value: any): string => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      // If contains comma, quote, or newline, wrap in quotes and escape quotes
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    // Helper function to create CSV row
    const createCsvRow = (fields: any[]): string => {
      return fields.map(escapeCsvField).join(',') + '\n';
    };

    // Fetch matches in batches
    const BATCH_SIZE = 1000;
    let offset = 0;
    let totalExported = 0;

    // Start streaming
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Write CSV header
          const headers = [
            'match_id',
            'project_id',
            'status',
            'method',
            'confidence',
            'store_part_number',
            'store_line_code',
            'store_description',
            'store_cost',
            'supplier_part_number',
            'supplier_line_code',
            'supplier_description',
            'supplier_cost',
            'vendor_action',
            'review_decision',
            'corrected_supplier_part',
          ];
          
          controller.enqueue(encoder.encode(createCsvRow(headers)));

          // Process matches in batches
          while (true) {
            const matches = await prisma.matchCandidate.findMany({
              where: { projectId },
              include: {
                storeItem: {
                  select: {
                    partNumber: true,
                    lineCode: true,
                    description: true,
                    currentCost: true,
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
                currentCost: true,
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
              let supplierCost = '';

              if (match.targetType === 'SUPPLIER') {
                const supplierItem = supplierItemsMap.get(match.targetId);
                if (supplierItem) {
                  supplierPartNumber = supplierItem.partNumber || '';
                  supplierLineCode = supplierItem.lineCode || '';
                  supplierDescription = supplierItem.description || '';
                  supplierCost = supplierItem.currentCost ? supplierItem.currentCost.toString() : '';
                }
              } else if (match.targetType === 'INVENTORY') {
                // For inventory matches, fetch the inventory item
                const inventoryItem = await prisma.inventoryItem.findUnique({
                  where: { id: match.targetId },
                  select: {
                    partNumber: true,
                    lineCode: true,
                    description: true,
                    cost: true,
                  },
                });
                if (inventoryItem) {
                  supplierPartNumber = inventoryItem.partNumber || '';
                  supplierLineCode = inventoryItem.lineCode || '';
                  supplierDescription = inventoryItem.description || '';
                  supplierCost = inventoryItem.cost ? inventoryItem.cost.toString() : '';
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

              const row = [
                match.id,
                match.projectId,
                match.status,
                match.method,
                confidencePercent,
                storeItem.partNumber || '',
                storeItem.lineCode || '',
                storeItem.description || '',
                storeItem.currentCost ? storeItem.currentCost.toString() : '',
                supplierPartNumber,
                supplierLineCode,
                supplierDescription,
                supplierCost,
                match.vendorAction || 'NONE',
                reviewDecision,
                match.correctedSupplierPartNumber || '',
              ];

              // Write row to stream
              controller.enqueue(encoder.encode(createCsvRow(row)));
              totalExported++;
            }

            offset += BATCH_SIZE;

            // Log progress
            if (totalExported % 1000 === 0) {
              console.log(`[EXPORT] Exported ${totalExported} matches...`);
            }
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
