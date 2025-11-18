import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/lib/db/prisma';

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

    // Fetch matches with related data
    const matches = await prisma.matchCandidate.findMany({
      where: whereClause,
      include: {
        storeItem: true,
      },
      orderBy: {
        confidence: 'desc',
      },
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
    });

    const supplierItemsMap = new Map(supplierItems.map(item => [item.id, item]));

    // Generate CSV content
    const headers = [
      'Match Status',
      'Confidence',
      'Match Method',
      'Store Part Number',
      'Store Line',
      'Store Description',
      'Store Cost',
      'Store Quantity',
      'Supplier Part Number',
      'Supplier Name',
      'Supplier Description',
      'Supplier Cost',
      'Supplier Quantity',
      'Source URL',
      'Match Features',
    ];

    const rows = matches.map(match => {
      const storeItem = match.storeItem;
      let supplierPartNumber = '';
      let supplierName = '';
      let supplierDescription = '';
      let supplierCost = '';
      let supplierQuantity = '';
      let sourceUrl = '';

      // Check if it's a web search match
      if (match.features && (match.features as any).webSearch) {
        supplierPartNumber = (match.features as any).supplierPartNumber || '';
        supplierName = (match.features as any).supplierName || 'Web Search';
        supplierDescription = (match.features as any).description || '';
        supplierCost = (match.features as any).price ? `$${(match.features as any).price}` : '';
        sourceUrl = (match.features as any).sourceUrl || '';
      } else if (match.targetType === 'SUPPLIER') {
        const supplierItem = supplierItemsMap.get(match.targetId);
        if (supplierItem) {
          supplierPartNumber = supplierItem.partNumber;
          supplierName = supplierItem.supplier;
          supplierDescription = supplierItem.description || '';
          supplierCost = supplierItem.currentCost ? `$${supplierItem.currentCost}` : '';
          supplierQuantity = supplierItem.quantity?.toString() || '';
        }
      }

      // Format match features
      const features = match.features ? JSON.stringify(match.features) : '';

      return [
        match.status,
        (match.confidence * 100).toFixed(1) + '%',
        match.method,
        storeItem.partNumber,
        storeItem.lineCode || '',
        storeItem.description || '',
        storeItem.currentCost ? `$${storeItem.currentCost}` : '',
        storeItem.quantity?.toString() || '',
        supplierPartNumber,
        supplierName,
        supplierDescription,
        supplierCost,
        supplierQuantity,
        sourceUrl,
        features,
      ];
    });

    // Escape CSV fields
    const escapeCsvField = (field: string) => {
      if (field.includes(',') || field.includes('"') || field.includes('\n')) {
        return `"${field.replace(/"/g, '""')}"`;
      }
      return field;
    };

    // Build CSV
    const csvContent = [
      headers.map(escapeCsvField).join(','),
      ...rows.map(row => row.map(escapeCsvField).join(',')),
    ].join('\n');

    console.log(`[EXPORT] Generated CSV with ${rows.length} rows`);

    // Return CSV file
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
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
