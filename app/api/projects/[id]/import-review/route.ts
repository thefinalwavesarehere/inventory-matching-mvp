import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/lib/db/prisma';
import { parse } from 'csv-parse/sync';
import { VendorAction, MatchStatus, ReviewSource } from '@prisma/client';

/**
 * Epic A1.3 - Excel Import & Apply Endpoint
 * 
 * Uploads reviewed CSV file and updates match candidates in the database.
 * 
 * Endpoint: POST /api/projects/:id/import-review
 * 
 * Logic:
 * - Parse uploaded CSV/XLSX
 * - Batch-fetch all matches once for validation and history logging
 * - Validate: match_id exists and belongs to project_id
 * - Update based on review_decision:
 *   - 'ACCEPT' or 'ACCEPTED' -> status = CONFIRMED
 *   - 'REJECT' or 'REJECTED' -> status = REJECTED
 *   - Empty/blank -> no status change
 * - Update corrected_supplier_part if provided
 * - Update vendor_action if changed
 * - Set reviewedAt to now()
 * - Set reviewSource to EXCEL
 * 
 * Response: { totalRows, updatedRows, skippedRows, errors: [] }
 */

interface ImportError {
  row: number;
  matchId: string;
  error: string;
}

interface UpdateData {
  matchId: string;
  status?: MatchStatus;
  vendorAction?: VendorAction;
  correctedSupplierPartNumber?: string | null;
  reviewSource: ReviewSource;
  reviewedAt: Date;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const projectId = params.id;

    console.log(`[IMPORT] Starting CSV import for project: ${projectId}`);

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

    // Parse form data
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    console.log(`[IMPORT] Processing file: ${file.name}, size: ${file.size} bytes`);

    // Read file content
    const fileContent = await file.text();

    // Parse CSV
    let records: any[];
    try {
      records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true, // Allow rows with different column counts
      });
    } catch (parseError: any) {
      console.error('[IMPORT] CSV parse error:', parseError);
      return NextResponse.json(
        { error: `Failed to parse CSV: ${parseError.message}` },
        { status: 400 }
      );
    }

    console.log(`[IMPORT] Parsed ${records.length} rows from CSV`);

    // Validate required headers
    const requiredHeaders = ['match_id', 'project_id'];
    if (records.length > 0) {
      const headers = Object.keys(records[0]);
      const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
      
      if (missingHeaders.length > 0) {
        return NextResponse.json({
          error: `Missing required headers: ${missingHeaders.join(', ')}`,
          hint: 'CSV must include match_id and project_id columns'
        }, { status: 400 });
      }
    }

    // Extract all match IDs from CSV
    const matchIds = records
      .map(row => row['match_id']?.trim())
      .filter(id => id); // Remove empty/null IDs

    console.log(`[IMPORT] Extracted ${matchIds.length} match IDs from CSV`);

    // Batch-fetch all matches in one query (PERFORMANCE OPTIMIZATION)
    const matches = await prisma.matchCandidate.findMany({
      where: {
        id: { in: matchIds },
      },
      include: {
        storeItem: { select: { partNumber: true } },
      },
    });

    console.log(`[IMPORT] Fetched ${matches.length} matches from database`);

    // Build matchesMap for O(1) lookups
    const matchesMap = new Map(
      matches.map(match => [match.id, match])
    );

    // Process updates
    const updates: UpdateData[] = [];
    const errors: ImportError[] = [];
    let skippedRows = 0;

    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      const rowNumber = i + 2; // +2 because: +1 for 0-index, +1 for header row
      const matchId = row['match_id']?.trim();
      const rowProjectId = row['project_id']?.trim();
      const reviewDecision = row['review_decision']?.trim();
      const vendorAction = row['vendor_action']?.trim().toUpperCase();
      const correctedSupplierPart = row['corrected_supplier_part']?.trim();

      // Skip rows without match_id
      if (!matchId) {
        skippedRows++;
        continue;
      }

      // Validate match exists (using map lookup - O(1))
      const match = matchesMap.get(matchId);

      if (!match) {
        errors.push({
          row: rowNumber,
          matchId,
          error: `Match ID not found in database`,
        });
        continue;
      }

      if (match.projectId !== projectId) {
        errors.push({
          row: rowNumber,
          matchId,
          error: `Match belongs to different project (expected: ${projectId}, got: ${match.projectId})`,
        });
        continue;
      }

      if (rowProjectId && rowProjectId !== projectId) {
        errors.push({
          row: rowNumber,
          matchId,
          error: `Project ID mismatch in CSV row (expected: ${projectId}, got: ${rowProjectId})`,
        });
        continue;
      }

      // Build update data
      const updateData: UpdateData = {
        matchId,
        reviewSource: ReviewSource.EXCEL,
        reviewedAt: new Date(),
      };

      let hasChanges = false;

      // Process review_decision
      if (reviewDecision && reviewDecision !== '') {
        const normalizedDecision = reviewDecision.toUpperCase();
        
        // Skip if this looks like a vendor_action value (common mistake)
        const vendorActionValues = ['NONE', 'LIFT', 'REBOX', 'UNKNOWN', 'CONTACT_VENDOR'];
        if (vendorActionValues.includes(normalizedDecision)) {
          // This is likely vendor_action in the wrong column, skip validation
          console.warn(`[IMPORT] Row ${rowNumber}: Skipping vendor_action value "${reviewDecision}" in review_decision column`);
        } else if (normalizedDecision === 'ACCEPT' || normalizedDecision === 'ACCEPTED') {
          updateData.status = MatchStatus.CONFIRMED;
          hasChanges = true;
        } else if (normalizedDecision === 'REJECT' || normalizedDecision === 'REJECTED') {
          updateData.status = MatchStatus.REJECTED;
          hasChanges = true;
        } else if (normalizedDecision !== 'PENDING') {
          errors.push({
            row: rowNumber,
            matchId,
            error: `Invalid review_decision: "${reviewDecision}". Must be ACCEPT, ACCEPTED, REJECT, REJECTED, or blank (case-insensitive).`,
          });
          continue;
        }
      }

      // Process vendor_action
      if (vendorAction && vendorAction !== '') {
        const validVendorActions = ['NONE', 'LIFT', 'REBOX', 'UNKNOWN', 'CONTACT_VENDOR'];
        if (validVendorActions.includes(vendorAction)) {
          // Only update if different from current value
          if (vendorAction !== match.vendorAction) {
            updateData.vendorAction = vendorAction as VendorAction;
            hasChanges = true;
          }
        } else {
          errors.push({
            row: rowNumber,
            matchId,
            error: `Invalid vendor_action: "${vendorAction}". Must be one of: ${validVendorActions.join(', ')}`,
          });
          continue;
        }
      }

      // Process corrected_supplier_part
      if (correctedSupplierPart !== undefined && correctedSupplierPart !== '') {
        updateData.correctedSupplierPartNumber = correctedSupplierPart;
        hasChanges = true;
      }

      // Only add to updates if there are actual changes
      if (hasChanges) {
        updates.push(updateData);
      } else {
        skippedRows++;
      }
    }

    console.log(`[IMPORT] Validation complete: ${updates.length} updates, ${errors.length} errors, ${skippedRows} skipped`);

    // If there are errors, return them without updating
    if (errors.length > 0) {
      return NextResponse.json({
        success: false,
        totalRows: records.length,
        updatedRows: 0,
        skippedRows,
        parseErrors: errors.length,
        errors: errors.slice(0, 10), // Return first 10 errors
        message: `Found ${errors.length} validation errors. No updates were applied.`,
      });
    }

    // Apply updates in a transaction
    let updatedCount = 0;
    if (updates.length > 0) {
      try {
        await prisma.$transaction(
          updates.map(({ matchId, ...data }) =>
            prisma.matchCandidate.update({
              where: { id: matchId },
              data,
            })
          )
        );
        updatedCount = updates.length;
        console.log(`[IMPORT] Successfully updated ${updatedCount} matches`);

        // Log to match history (Epic A3)
        const acceptedRecords: Array<{
          projectId: string;
          storePartNumber: string;
          supplierPartNumber: string;
          supplierLineCode: string | null;
        }> = [];
        const rejectedRecords: typeof acceptedRecords = [];

        for (const update of updates) {
          if (update.status === MatchStatus.CONFIRMED || update.status === MatchStatus.REJECTED) {
            // Use matchesMap for O(1) lookup (already fetched)
            const match = matchesMap.get(update.matchId);
            
            if (match) {
              const supplierItem = await prisma.supplierItem.findUnique({
                where: { id: match.targetId },
                select: { partNumber: true, lineCode: true },
              });
              
              if (supplierItem) {
                const record = {
                  projectId,
                  storePartNumber: match.storeItem.partNumber,
                  supplierPartNumber: supplierItem.partNumber,
                  supplierLineCode: supplierItem.lineCode,
                };
                
                if (update.status === MatchStatus.CONFIRMED) {
                  acceptedRecords.push(record);
                } else {
                  rejectedRecords.push(record);
                }
              }
            }
          }
        }

        if (acceptedRecords.length > 0) {
          await prisma.acceptedMatchHistory.createMany({
            data: acceptedRecords,
            skipDuplicates: true,
          });
          console.log(`[IMPORT] Logged ${acceptedRecords.length} accepted matches to history`);
        }

        if (rejectedRecords.length > 0) {
          await prisma.rejectedMatchHistory.createMany({
            data: rejectedRecords,
            skipDuplicates: true,
          });
          console.log(`[IMPORT] Logged ${rejectedRecords.length} rejected matches to history`);
        }
      } catch (txError: any) {
        console.error('[IMPORT] Transaction error:', txError);
        return NextResponse.json({
          success: false,
          error: `Database update failed: ${txError.message}`,
        }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      totalRows: records.length,
      updatedRows: updatedCount,
      skippedRows,
      parseErrors: 0,
      errors: [],
      message: `Successfully updated ${updatedCount} matches`,
    });

  } catch (error: any) {
    console.error('[IMPORT] Unexpected error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Internal server error',
    }, { status: 500 });
  }
}
