import { NextRequest, NextResponse } from 'next/server';
import prisma from '../../lib/db/prisma';
import * as XLSX from 'xlsx';

/**
 * GET endpoint to generate unmatched parts report
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const format = searchParams.get('format') || 'json'; // 'json' or 'xlsx'

    if (!projectId) {
      return NextResponse.json(
        { error: 'Project ID is required' },
        { status: 400 }
      );
    }

    // Get all unmatched parts for the project
    const unmatchedParts = await prisma.unmatchedPart.findMany({
      where: {
        arnoldItem: {
          session: {
            projectId,
          },
        },
      },
      include: {
        arnoldItem: {
          include: {
            matchResults: {
              orderBy: {
                confidenceScore: 'desc',
              },
              take: 3, // Include top 3 attempted matches
              include: {
                supplierItem: true,
              },
            },
          },
        },
      },
      orderBy: {
        lastAttemptAt: 'desc',
      },
    });

    // Also get rejected matches (these are manually unmatched)
    const rejectedMatches = await prisma.matchResult.findMany({
      where: {
        status: 'rejected',
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
        updatedAt: 'desc',
      },
    });

    // Combine and format the data
    const reportData = [
      ...unmatchedParts.map(unmatched => ({
        partNumber: unmatched.arnoldItem.partNumber,
        usageLast12: unmatched.arnoldItem.usageLast12,
        cost: unmatched.arnoldItem.cost,
        attemptedMethods: unmatched.attemptedMethods.join(', '),
        lastAttemptAt: unmatched.lastAttemptAt.toISOString(),
        notes: unmatched.notes || '',
        status: 'Unmatched',
        topAttemptedMatches: unmatched.arnoldItem.matchResults
          .map(m => ({
            supplierPart: m.supplierItem?.partFull || 'N/A',
            confidence: (m.confidenceScore * 100).toFixed(1) + '%',
            stage: m.matchStage,
          })),
      })),
      ...rejectedMatches.map(rejected => ({
        partNumber: rejected.arnoldItem.partNumber,
        usageLast12: rejected.arnoldItem.usageLast12,
        cost: rejected.arnoldItem.cost,
        attemptedMethods: rejected.matchStage,
        lastAttemptAt: rejected.updatedAt.toISOString(),
        notes: rejected.notes || 'Rejected by user',
        status: 'Rejected',
        topAttemptedMatches: rejected.supplierItem ? [{
          supplierPart: rejected.supplierItem.partFull,
          confidence: (rejected.confidenceScore * 100).toFixed(1) + '%',
          stage: rejected.matchStage,
        }] : [],
      })),
    ];

    // Calculate statistics
    const stats = {
      totalUnmatched: reportData.length,
      byMethod: reportData.reduce((acc: any, item) => {
        const methods = item.attemptedMethods.split(', ');
        methods.forEach((method: string) => {
          acc[method] = (acc[method] || 0) + 1;
        });
        return acc;
      }, {}),
      byStatus: {
        unmatched: unmatchedParts.length,
        rejected: rejectedMatches.length,
      },
    };

    // Return as JSON
    if (format === 'json') {
      return NextResponse.json({
        success: true,
        stats,
        unmatchedParts: reportData,
      });
    }

    // Generate Excel file
    if (format === 'xlsx') {
      const workbook = XLSX.utils.book_new();

      // Create main sheet with unmatched parts
      const mainData = reportData.map(item => ({
        'Part Number': item.partNumber,
        'Usage (Last 12)': item.usageLast12 || 0,
        'Cost': item.cost || 0,
        'Status': item.status,
        'Attempted Methods': item.attemptedMethods,
        'Last Attempt': new Date(item.lastAttemptAt).toLocaleDateString(),
        'Notes': item.notes,
        'Top Match 1': item.topAttemptedMatches[0]?.supplierPart || '',
        'Top Match 1 Confidence': item.topAttemptedMatches[0]?.confidence || '',
        'Top Match 2': item.topAttemptedMatches[1]?.supplierPart || '',
        'Top Match 2 Confidence': item.topAttemptedMatches[1]?.confidence || '',
      }));

      const mainSheet = XLSX.utils.json_to_sheet(mainData);
      XLSX.utils.book_append_sheet(workbook, mainSheet, 'Unmatched Parts');

      // Create summary sheet
      const summaryData = [
        { Metric: 'Total Unmatched Parts', Value: stats.totalUnmatched },
        { Metric: 'Unmatched (No Match Found)', Value: stats.byStatus.unmatched },
        { Metric: 'Rejected (By User)', Value: stats.byStatus.rejected },
        { Metric: '', Value: '' },
        { Metric: 'Attempted Methods:', Value: '' },
        ...Object.entries(stats.byMethod).map(([method, count]) => ({
          Metric: `  ${method}`,
          Value: count,
        })),
      ];

      const summarySheet = XLSX.utils.json_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

      // Generate buffer
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      // Return as downloadable file
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="unmatched-parts-${projectId}-${Date.now()}.xlsx"`,
        },
      });
    }

    return NextResponse.json(
      { error: 'Invalid format. Use json or xlsx' },
      { status: 400 }
    );

  } catch (error) {
    console.error('Error generating report:', error);
    return NextResponse.json(
      { 
        error: 'Failed to generate report',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * POST endpoint to export all confirmed matches
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, includeEnrichment } = body;

    if (!projectId) {
      return NextResponse.json(
        { error: 'Project ID is required' },
        { status: 400 }
      );
    }

    // Get all confirmed matches
    const confirmedMatches = await prisma.matchResult.findMany({
      where: {
        status: 'confirmed',
        arnoldItem: {
          session: {
            projectId,
          },
        },
      },
      include: {
        arnoldItem: true,
        supplierItem: true,
        enrichmentData: includeEnrichment,
      },
      orderBy: {
        confirmedAt: 'desc',
      },
    });

    // Format data for export
    const exportData = confirmedMatches.map(match => {
      const baseData: any = {
        'Arnold Part Number': match.arnoldItem.partNumber,
        'Arnold Usage (Last 12)': match.arnoldItem.usageLast12 || 0,
        'Arnold Cost': match.arnoldItem.cost || 0,
        'Supplier Part Number': match.supplierItem?.partFull || '',
        'Supplier Line Code': match.supplierItem?.lineCode || '',
        'Supplier Description': match.supplierItem?.description || '',
        'Supplier Qty Available': match.supplierItem?.qtyAvail || 0,
        'Supplier Cost': match.supplierItem?.cost || 0,
        'Match Stage': match.matchStage,
        'Confidence Score': (match.confidenceScore * 100).toFixed(1) + '%',
        'Confirmed At': match.confirmedAt ? new Date(match.confirmedAt).toLocaleDateString() : '',
        'Confirmed By': match.confirmedBy || '',
      };

      // Add enrichment data if requested
      if (includeEnrichment && match.enrichmentData) {
        match.enrichmentData.forEach((enrichment: any) => {
          baseData[`Enriched: ${enrichment.fieldName}`] = enrichment.fieldValue;
        });
      }

      return baseData;
    });

    // Generate Excel file
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Confirmed Matches');

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Return as downloadable file
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="confirmed-matches-${projectId}-${Date.now()}.xlsx"`,
      },
    });

  } catch (error) {
    console.error('Error exporting matches:', error);
    return NextResponse.json(
      { 
        error: 'Failed to export matches',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
