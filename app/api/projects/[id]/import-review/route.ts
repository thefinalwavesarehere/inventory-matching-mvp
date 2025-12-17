import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/lib/db/prisma';
import { parse } from 'csv-parse/sync';

/**
 * Epic A1.3 - Excel Import & Apply Endpoint
 * 
 * Uploads reviewed CSV file and updates match candidates in the database.
 * 
 * Endpoint: POST /api/projects/:id/import-review
 * 
 * Logic:
 * - Parse uploaded CSV/XLSX
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
  status?: 'CONFIRMED' | 'REJECTED';
  vendorAction?: string;
  correctedSupplierPartNumber?: string | null;
  reviewSource: 'EXCEL';
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

    // Process updates
    const updates: UpdateData[] = [];
    const errors: ImportError[] = [];
    let skippedRows = 0;

    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      const rowNumber = i + 2; // +2 because: +1 for 0-index, +1 for header row
      const matchId = row['match_id']?.trim();
      const rowProjectId = row['project_id']?.trim();
      const reviewDecision = row['review_decision']?.trim().toUpperCase();
      const vendorAction = row['vendor_action']?.trim().toUpperCase();
      const correctedSupplierPart = row['corrected_supplier_part']?.trim();

      // Skip rows without match_id
      if (!matchId) {
        skippedRows++;
        continue;
      }

      // Validate match exists and belongs to project
      const match = await prisma.matchCandidate.findUnique({
        where: { id: matchId },
        select: { id: true, projectId: true, status: true, vendorAction: true },
      });

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
          error: `Match belongs to different project (expected: ${projectId}, found: ${match.projectId})`,
        });
        continue;
      }

      // Validate project_id in CSV matches
      if (rowProjectId && rowProjectId !== projectId) {
        errors.push({
          row: rowNumber,
          matchId,
          error: `Project ID mismatch in CSV (expected: ${projectId}, found: ${rowProjectId})`,
        });
        continue;
      }

      // Build update data
      const updateData: UpdateData = {
        matchId,
        reviewSource: 'EXCEL',
        reviewedAt: new Date(),
      };

      let hasChanges = false;

      // Process review_decision
      if (reviewDecision && reviewDecision.trim() !== '') {
        const normalizedDecision = reviewDecision.toUpperCase();
        
        // Skip if this looks like a vendor_action value (common mistake)
        const vendorActionValues = ['NONE', 'LIFT', 'REBOX', 'UNKNOWN', 'CONTACT_VENDOR'];
        if (vendorActionValues.includes(normalizedDecision)) {
          // This is likely vendor_action in the wrong column, skip validation
          console.warn(`[IMPORT] Row ${rowNumber}: Skipping vendor_action value "${reviewDecision}" in review_decision column`);
        } else if (normalizedDecision === 'ACCEPT' || normalizedDecision === 'ACCEPTED') {
          updateData.status = 'CONFIRMED';
          hasChanges = true;
        } else if (normalizedDecision === 'REJECT' || normalizedDecision === 'REJECTED') {
          updateData.status = 'REJECTED';
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
            updateData.vendorAction = vendorAction;
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
      if (correctedSupplierPart !== undefined) {
        updateData.correctedSupplierPartNumber = correctedSupplierPart || null;
        hasChanges = true;
      }

      // Only add to updates if there are actual changes
      if (hasChanges) {
        updates.push(updateData);
      } else {
        skippedRows++;
      }
    }

    console.log(`[IMPORT] Validation complete. Updates: ${updates.length}, Errors: ${errors.length}, Skipped: ${skippedRows}`);

    // If there are errors, return them without applying updates
    if (errors.length > 0) {
      return NextResponse.json({
        success: false,
        totalRows: records.length,
        updatedRows: 0,
        skippedRows,
        errors,
        message: `Found ${errors.length} error(s). No updates were applied.`,
      }, { status: 400 });
    }

    // Apply updates in transaction
    let updatedCount = 0;
    if (updates.length > 0) {
      try {
        await prisma.$transaction(
          updates.map(update => {
            const { matchId, ...data } = update;
            return prisma.matchCandidate.update({
              where: { id: matchId },
              data,
            });
          })
        );
        updatedCount = updates.length;
        console.log(`[IMPORT] Successfully updated ${updatedCount} matches`);
      } catch (txError: any) {
        console.error('[IMPORT] Transaction error:', txError);
        return NextResponse.json({
          success: false,
          error: 'Failed to apply updates to database',
          details: txError.message,
        }, { status: 500 });
      }
    }

    // Return success response
    return NextResponse.json({
      success: true,
      totalRows: records.length,
      updatedRows: updatedCount,
      skippedRows,
      errors: [],
      message: `Successfully updated ${updatedCount} match(es). Skipped ${skippedRows} row(s) with no changes.`,
    });

  } catch (error: any) {
    console.error('[IMPORT] Error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: error.message || 'Failed to import CSV',
        details: error.stack,
      },
      { status: 500 }
    );
  }
}
