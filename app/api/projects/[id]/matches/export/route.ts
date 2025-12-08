/**
 * Export matches to CSV for Excel review
 * Epic A1 - Excel Review Round-Trip
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/lib/db/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';

/**
 * Map internal match methods to friendly export labels
 */
function mapMethodToExportLabel(method: string): string {
  const mapping: Record<string, string> = {
    'EXACT_NORM': 'EXACT',
    'EXACT_NORMALIZED': 'EXACT',
    'FUZZY': 'FUZZY',
    'FUZZY_SUBSTRING': 'FUZZY',
    'AI': 'AI',
    'WEB_SEARCH': 'WEB',
    'INTERCHANGE': 'INTERCHANGE',
    'LINE_PN': 'EXACT',
    'DESC_SIM': 'FUZZY',
    'RULE_BASED': 'RULE',
  };
  return mapping[method] || method;
}

/**
 * Map status to review_decision for export
 */
function mapStatusToReviewDecision(status: string): string {
  if (status === 'CONFIRMED') return 'ACCEPT';
  if (status === 'REJECTED') return 'REJECT';
  return ''; // PENDING = blank
}

/**
 * Convert array of objects to CSV string
 */
function arrayToCSV(data: any[]): string {
  if (data.length === 0) return '';

  // Get headers from first object
  const headers = Object.keys(data[0]);
  
  // Create CSV rows
  const rows = data.map(obj => {
    return headers.map(header => {
      const value = obj[header];
      // Handle null/undefined
      if (value === null || value === undefined) return '';
      // Escape quotes and wrap in quotes if contains comma, quote, or newline
      const stringValue = String(value);
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    }).join(',');
  });

  // Combine headers and rows
  return [headers.join(','), ...rows].join('\n');
}

/**
 * GET /api/projects/[id]/matches/export
 * Export all matches for a project to CSV
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const projectId = params.id;

    // Verify project exists and user has access
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Fetch all matches with related data
    const matches = await prisma.matchCandidate.findMany({
      where: { projectId },
      include: {
        storeItem: true,
        decidedBy: {
          select: {
            name: true,
            email: true,
          },
        },
      },
      orderBy: [
        { status: 'asc' }, // PENDING first, then CONFIRMED, then REJECTED
        { confidence: 'desc' }, // High confidence first
      ],
    });

    console.log(`[EXPORT] Found ${matches.length} matches for project ${projectId}`);

    // Fetch supplier items for all matches
    const supplierIds = matches
      .filter(m => m.targetType === 'SUPPLIER')
      .map(m => m.targetId);

    const supplierItems = await prisma.supplierItem.findMany({
      where: { id: { in: supplierIds } },
    });

    const supplierMap = new Map(supplierItems.map(s => [s.id, s]));

    // Transform matches to export format
    const exportData = matches.map(match => {
      const storeItem = match.storeItem;
      const supplierItem = match.targetType === 'SUPPLIER' 
        ? supplierMap.get(match.targetId) 
        : null;

      return {
        match_id: match.id,
        project_id: match.projectId,
        status: match.status,
        method: mapMethodToExportLabel(match.method),
        confidence: match.confidence.toFixed(3),
        
        // Store item fields
        store_part_number: storeItem.partNumber,
        store_line_code: storeItem.lineCode || '',
        store_description: storeItem.description || '',
        store_mfr_part_number: storeItem.mfrPartNumber || '',
        store_quantity: storeItem.quantity || '',
        store_cost: storeItem.currentCost ? storeItem.currentCost.toString() : '',
        
        // Supplier item fields
        supplier_part_number: supplierItem?.partNumber || '',
        supplier_line_code: supplierItem?.lineCode || '',
        supplier_description: supplierItem?.description || '',
        supplier_mfr_part_number: supplierItem?.mfrPartNumber || '',
        supplier_cost: supplierItem?.currentCost ? supplierItem.currentCost.toString() : '',
        
        // Category/subcategory (if available in rawData)
        category: '',
        subcategory: '',
        
        // Vendor action
        vendor_action: match.vendorAction || 'NONE',
        
        // Review fields (editable in Excel)
        review_decision: mapStatusToReviewDecision(match.status),
        corrected_supplier_part: match.correctedSupplierPartNumber || '',
        
        // Review metadata (read-only)
        reviewed_by: match.decidedBy?.name || match.decidedBy?.email || '',
        reviewed_at: match.reviewedAt ? match.reviewedAt.toISOString() : '',
        review_source: match.reviewSource || '',
        
        // Notes
        notes: match.note || '',
      };
    });

    console.log(`[EXPORT] Transformed ${exportData.length} rows for export`);

    // Generate CSV
    const csv = arrayToCSV(exportData);

    // Return CSV with appropriate headers
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="matches-${project.name.replace(/[^a-zA-Z0-9]/g, '_')}-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });

  } catch (error) {
    console.error('[EXPORT] Error exporting matches:', error);
    return NextResponse.json(
      { error: 'Failed to export matches', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
