/**
 * Manual Review CSV Import API
 * 
 * POST /api/review/import - Import manual review decisions from CSV
 * 
 * Expected CSV format:
 * - match_candidate_id (required)
 * - store_part_number (required)
 * - supplier_part_number (required)
 * - review_decision (optional: "approve" or "reject")
 * - corrected_supplier_part_number (optional: for corrections)
 * 
 * Logic:
 * - If review_decision = "approve" → Confirm match + create POSITIVE_MAP rule
 * - If review_decision = "reject" → Reject match + create NEGATIVE_BLOCK rule
 * - If corrected_supplier_part_number provided → Create POSITIVE_MAP rule with correction
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/app/lib/auth-helpers';
import { prisma } from '@/app/lib/db/prisma';
import { learnFromBulkDecisions, ReviewDecision } from '@/app/lib/master-rules-learner';
import { parse } from 'csv-parse/sync';

export async function POST(req: NextRequest) {
  try {
    // Require authentication
    const { profile } = await requireAuth();
    
    // Parse form data
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const projectId = formData.get('projectId') as string;
    
    if (!file) {
      return NextResponse.json(
        { success: false, error: 'CSV file required' },
        { status: 400 }
      );
    }
    
    if (!projectId) {
      return NextResponse.json(
        { success: false, error: 'Project ID required' },
        { status: 400 }
      );
    }
    
    // Read CSV content
    const csvText = await file.text();
    
    // Parse CSV
    const records = parse(csvText, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Array<Record<string, string>>;
    
    console.log(`[REVIEW-IMPORT] Parsed ${records.length} rows from CSV`);
    
    // Process each row
    const toConfirm: string[] = [];
    const toReject: string[] = [];
    const decisions: ReviewDecision[] = [];
    
    for (const row of records) {
      const matchId = row.match_candidate_id;
      const storePN = row.store_part_number;
      const supplierPN = row.supplier_part_number;
      const lineCode = row.line_code || null;
      const reviewDecision = row.review_decision?.toLowerCase().trim();
      const correctedPN = row.corrected_supplier_part_number?.trim();
      
      if (!matchId || !storePN || !supplierPN) {
        console.warn(`[REVIEW-IMPORT] Skipping row with missing required fields`);
        continue;
      }
      
      // Determine action
      if (reviewDecision === 'approve') {
        toConfirm.push(matchId);
        decisions.push({
          matchCandidateId: matchId,
          storePartNumber: storePN,
          supplierPartNumber: supplierPN,
          lineCode,
          decision: 'approve',
          projectId,
          userId: profile.id,
        });
      } else if (reviewDecision === 'reject') {
        toReject.push(matchId);
        decisions.push({
          matchCandidateId: matchId,
          storePartNumber: storePN,
          supplierPartNumber: supplierPN,
          lineCode,
          decision: 'reject',
          projectId,
          userId: profile.id,
        });
      } else if (correctedPN && correctedPN !== supplierPN) {
        // Correction: reject original match and create rule for corrected PN
        toReject.push(matchId);
        decisions.push({
          matchCandidateId: matchId,
          storePartNumber: storePN,
          supplierPartNumber: supplierPN,
          lineCode,
          decision: 'correct',
          correctedSupplierPartNumber: correctedPN,
          projectId,
          userId: profile.id,
        });
      }
    }
    
    console.log(`[REVIEW-IMPORT] Actions: ${toConfirm.length} approve, ${toReject.length} reject`);
    
    // Apply confirmations
    if (toConfirm.length > 0) {
      await prisma.matchCandidate.updateMany({
        where: { id: { in: toConfirm } },
        data: { status: 'CONFIRMED' },
      });
      console.log(`[REVIEW-IMPORT] Confirmed ${toConfirm.length} matches`);
    }
    
    // Apply rejections
    if (toReject.length > 0) {
      await prisma.matchCandidate.updateMany({
        where: { id: { in: toReject } },
        data: { status: 'REJECTED' },
      });
      console.log(`[REVIEW-IMPORT] Rejected ${toReject.length} matches`);
    }
    
    // Learn from decisions and create master rules
    const learningResult = await learnFromBulkDecisions(decisions);
    console.log(`[REVIEW-IMPORT] Master rules: ${learningResult.created} created, ${learningResult.skipped} skipped, ${learningResult.errors} errors`);
    
    return NextResponse.json({
      success: true,
      message: `Processed ${records.length} rows`,
      stats: {
        confirmed: toConfirm.length,
        rejected: toReject.length,
        rulesCreated: learningResult.created,
        rulesSkipped: learningResult.skipped,
        rulesErrors: learningResult.errors,
      },
    });
    
  } catch (error: any) {
    console.error('[REVIEW-IMPORT] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to import review CSV' },
      { status: 500 }
    );
  }
}
