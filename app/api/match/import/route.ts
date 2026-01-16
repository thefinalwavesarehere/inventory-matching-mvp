/**
 * Import CSV with bulk review decisions
 * Epic A1 - Excel Review Round-Trip
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/lib/db/prisma';
// Migrated to Supabase auth
import { requireAuth } from '@/app/lib/auth-helpers';

interface ImportRow {
  matchId: string;
  decision: string; // 'ACCEPT', 'REJECT', or empty
  correctedPartNumber?: string;
  notes?: string;
}

/**
 * Parse CSV content into rows
 */
function parseCSV(content: string): any[] {
  const lines = content.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows: any[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const row: any = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    rows.push(row);
  }

  return rows;
}

/**
 * POST /api/match/import
 * Import CSV file with review decisions
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as any).id;

    // Get form data
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const projectId = formData.get('projectId') as string;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID required' }, { status: 400 });
    }

    console.log(`[IMPORT] Processing file: ${file.name} for project: ${projectId}`);

    // Read file content
    const content = await file.text();
    const rows = parseCSV(content);

    console.log(`[IMPORT] Parsed ${rows.length} rows from CSV`);

    // Validate and prepare updates
    const updates: ImportRow[] = [];
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // +2 because of header and 0-indexing

      // Get match ID (try different possible column names)
      const matchId = row['Match ID'] || row['match_id'] || row['matchId'];
      if (!matchId) {
        errors.push(`Row ${rowNum}: Missing match ID`);
        continue;
      }

      // Get decision (try different possible column names)
      const decision = (row['Review Decision'] || row['review_decision'] || row['decision'] || '').toUpperCase();

      // Skip rows with no decision
      if (!decision || decision === '') {
        continue;
      }

      // Validate decision
      if (decision !== 'ACCEPT' && decision !== 'REJECT') {
        errors.push(`Row ${rowNum}: Invalid decision "${decision}" (must be ACCEPT or REJECT)`);
        continue;
      }

      updates.push({
        matchId,
        decision,
        correctedPartNumber: row['Corrected Part Number'] || row['corrected_supplier_part'] || '',
        notes: row['Notes'] || row['notes'] || '',
      });
    }

    console.log(`[IMPORT] Found ${updates.length} valid updates, ${errors.length} errors`);

    if (errors.length > 0 && updates.length === 0) {
      return NextResponse.json({
        error: 'No valid updates found',
        details: errors,
      }, { status: 400 });
    }

    // Apply updates in transaction
    const results = await prisma.$transaction(async (tx) => {
      const updated: string[] = [];
      const failed: string[] = [];

      for (const update of updates) {
        try {
          // Verify match exists and belongs to project
          const match = await tx.matchCandidate.findFirst({
            where: {
              id: update.matchId,
              projectId,
            },
          });

          if (!match) {
            failed.push(`Match ${update.matchId}: Not found in project`);
            continue;
          }

          // Update match status
          await tx.matchCandidate.update({
            where: { id: update.matchId },
            data: {
              status: update.decision === 'ACCEPT' ? 'CONFIRMED' : 'REJECTED',
              decidedById: userId,
              decidedAt: new Date(),
              note: update.notes || match.note,
            },
          });

          updated.push(update.matchId);
        } catch (err) {
          console.error(`[IMPORT] Error updating match ${update.matchId}:`, err);
          failed.push(`Match ${update.matchId}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }

      return { updated, failed };
    });

    console.log(`[IMPORT] Successfully updated ${results.updated.length} matches, ${results.failed.length} failed`);

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId,
        projectId,
        entity: 'MatchCandidate',
        entityId: projectId,
        action: 'BULK_IMPORT',
        meta: {
          fileName: file.name,
          totalRows: rows.length,
          updatedCount: results.updated.length,
          failedCount: results.failed.length,
          errors: errors.concat(results.failed),
        },
      },
    });

    return NextResponse.json({
      success: true,
      summary: {
        totalRows: rows.length,
        validUpdates: updates.length,
        successfulUpdates: results.updated.length,
        failedUpdates: results.failed.length,
        parseErrors: errors.length,
      },
      errors: errors.concat(results.failed),
    });

  } catch (error) {
    console.error('[IMPORT] Error importing CSV:', error);
    return NextResponse.json(
      {
        error: 'Failed to import CSV',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
