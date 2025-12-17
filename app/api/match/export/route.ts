import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/lib/db/prisma';

/**
 * Legacy Export Endpoint (Updated to Epic A1.2 Format)
 * 
 * Used by Match Review page export buttons (Export All, Export Pending, etc.)
 * Now uses the same Epic A1.2 column format for consistency.
 * 
 * Endpoint: GET /api/match/export?projectId=...&status=...
 * 
 * Query params:
 * - projectId: Required
 * - status: Optional (pending, confirmed, rejected, or all)
 */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const status = searchParams.get('status'); // 'confirmed', 'pending', 'rejected', or 'all'
    
    if (!projectId) {
      return NextResponse.json({ error: 'Project ID required' }, { status: 400 });
    }

    console.log(`[EXPORT] Exporting matches for project: ${projectId}, status: ${status}`);

    // Build where clause based on status filter
    const whereClause: any = { projectId };
    if (status && status !== 'all') {
      whereClause.status = status.toUpperCase();
    }

    // Helper function to escape CSV fields
    const escapeCsvField = (value: any): string => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    // Helper function to create CSV row
    const createCsvRow = (fields: any[]): string => {
      return fields.map(escapeCsvField).join(',') + '\n';
    };

    // Fetch matches with related data
    const matches = await prisma.matchCandidate.findMany({
      where: whereClause,
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
        { status: 'asc' },
        { confidence: 'desc' },
      ],
    });

    console.log(`[EXPORT] Found ${matches.length} matches to export`);

    // Get supplier items for matches
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

    const supplierItemsMap = new Map(supplierItems.map(item => [item.id, item]));

    // Generate CSV content with Epic A1.2 format
    const headers = [
      'match_id',
      'project_id',
      'status',
      'method',
      'confidence',
      'store_part_number',
      'store_line_code',
      'store_description',
      'supplier_part_number',
      'supplier_line_code',
      'supplier_description',
      'vendor_action',
      'review_decision',
      'corrected_supplier_part',
    ];

    const rows = matches.map(match => {
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
        // Note: This is synchronous, so we can't fetch inventory items here
        // For now, leave blank - could be optimized with batch fetch
        supplierPartNumber = '';
        supplierLineCode = '';
        supplierDescription = '';
      }

      // Determine review_decision
      let reviewDecision = '';
      if (match.status === 'CONFIRMED') {
        reviewDecision = 'ACCEPTED';
      } else if (match.status === 'REJECTED') {
        reviewDecision = 'REJECTED';
      }

      // Format confidence as percentage
      const confidencePercent = (match.confidence * 100).toFixed(1);

      return [
        match.id,
        match.projectId,
        match.status,
        match.method,
        confidencePercent,
        storeItem.partNumber || '',
        storeItem.lineCode || '',
        storeItem.description || '',
        supplierPartNumber,
        supplierLineCode,
        supplierDescription,
        match.vendorAction || 'NONE',
        reviewDecision,
        match.correctedSupplierPartNumber || '',
      ];
    });

    // Build CSV
    const csvContent = [
      createCsvRow(headers),
      ...rows.map(row => createCsvRow(row)),
    ].join('');

    console.log(`[EXPORT] Generated CSV with ${rows.length} rows`);

    // Return CSV file
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="matches-${status || 'all'}-${new Date().toISOString().split('T')[0]}.csv"`,
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
