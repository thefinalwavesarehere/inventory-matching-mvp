/**
 * Epic B1: Bulk Operations API
 * 
 * POST /api/projects/:id/matches/bulk
 * 
 * Handles bulk updates to match candidates:
 * - Update status (ACCEPTED/REJECTED) with history logging
 * - Update vendor actions (LIFT/REBOX/etc.)
 */

import { NextRequest, NextResponse } from 'next/server';
import { MatchStatus, VendorAction } from '@prisma/client';
import { prisma } from '@/app/lib/db/prisma';
import { requireAuth } from '@/app/lib/auth-helpers';
import { logActivity, ActivityType } from '@/app/lib/logger';
import { learnFromBulkDecisions } from '@/app/lib/master-rules-learner';


export const dynamic = 'force-dynamic';

interface BulkUpdateStatusRequest {
  operation: 'update_status';
  matchIds: string[];
  status: 'ACCEPTED' | 'REJECTED';
}

interface BulkUpdateVendorActionRequest {
  operation: 'update_vendor_action';
  matchIds: string[];
  vendorAction: VendorAction;
}

type BulkOperationRequest = BulkUpdateStatusRequest | BulkUpdateVendorActionRequest;

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Require authentication
    const { profile } = await requireAuth();
    
    const projectId = params.id;
    const body: BulkOperationRequest = await request.json();

    const { operation, matchIds } = body;

    if (!operation || !matchIds || !Array.isArray(matchIds) || matchIds.length === 0) {
      return NextResponse.json(
        { error: 'Invalid request. Expected operation and matchIds array.' },
        { status: 400 }
      );
    }

    // Validate project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    if (operation === 'update_status') {
      return await handleUpdateStatus(projectId, body as BulkUpdateStatusRequest, profile.id, request);
    } else if (operation === 'update_vendor_action') {
      return await handleUpdateVendorAction(projectId, body as BulkUpdateVendorActionRequest, profile.id, request);
    } else {
      return NextResponse.json(
        { error: `Unknown operation: ${operation}` },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error('[BULK_OPERATIONS] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to perform bulk operation' },
      { status: 500 }
    );
  }
}

/**
 * Handle bulk status update (ACCEPTED/REJECTED)
 * Also logs to AcceptedMatchHistory or RejectedMatchHistory
 */
async function handleUpdateStatus(
  projectId: string,
  request: BulkUpdateStatusRequest,
  userId: string,
  httpRequest: NextRequest
): Promise<NextResponse> {
  const { matchIds, status } = request;

  // Validate status
  if (status !== 'ACCEPTED' && status !== 'REJECTED') {
    return NextResponse.json(
      { error: 'Status must be ACCEPTED or REJECTED' },
      { status: 400 }
    );
  }

  // Map to Prisma enum
  const prismaStatus: MatchStatus = status === 'ACCEPTED' ? 'CONFIRMED' : 'REJECTED';

  // Fetch matches to get part numbers for history logging
  const matches = await prisma.matchCandidate.findMany({
    where: {
      id: { in: matchIds },
      projectId,
    },
    include: {
      storeItem: {
        select: {
          partNumber: true,
        },
      },
    },
  });

  if (matches.length === 0) {
    return NextResponse.json(
      { error: 'No matches found with the provided IDs' },
      { status: 404 }
    );
  }

  // Fetch supplier items separately (polymorphic relation)
  const supplierItemIds = matches
    .filter(m => m.targetType === 'SUPPLIER')
    .map(m => m.targetId);
  
  const supplierItems = await prisma.supplierItem.findMany({
    where: { id: { in: supplierItemIds } },
    select: {
      id: true,
      partNumber: true,
      lineCode: true,
    },
  });
  
  // Create a map for quick lookup
  const supplierItemMap = new Map(
    supplierItems.map(item => [item.id, item])
  );

  // Perform bulk update and history logging in a transaction
  await prisma.$transaction(async (tx) => {
    // Update match status
    await tx.matchCandidate.updateMany({
      where: {
        id: { in: matchIds },
        projectId,
      },
      data: {
        status: prismaStatus,
        reviewSource: 'UI',
        updatedAt: new Date(),
      },
    });

    // Log to history tables
    if (status === 'ACCEPTED') {
      const historyRecords = matches
        .map((match) => {
          const supplierItem = supplierItemMap.get(match.targetId);
          if (!supplierItem) return null;
          
          return {
            projectId,
            storePartNumber: match.storeItem.partNumber,
            supplierPartNumber: supplierItem.partNumber,
            supplierLineCode: supplierItem.lineCode || null,
          };
        })
        .filter((record): record is NonNullable<typeof record> => record !== null);

      if (historyRecords.length > 0) {
        await tx.acceptedMatchHistory.createMany({
          data: historyRecords,
          skipDuplicates: true,
        });
      }
    } else {
      const historyRecords = matches
        .map((match) => {
          const supplierItem = supplierItemMap.get(match.targetId);
          if (!supplierItem) return null;
          
          return {
            projectId,
            storePartNumber: match.storeItem.partNumber,
            supplierPartNumber: supplierItem.partNumber,
            supplierLineCode: supplierItem.lineCode || null,
          };
        })
        .filter((record): record is NonNullable<typeof record> => record !== null);

      if (historyRecords.length > 0) {
        await tx.rejectedMatchHistory.createMany({
          data: historyRecords,
          skipDuplicates: true,
        });
      }
    }
  });

  console.log(
    `[BULK_OPERATIONS] Updated ${matches.length} matches to ${status} for project ${projectId}`
  );

  // Create master rules from these decisions
  console.log(`[BULK_OPERATIONS] Starting master rules creation for ${matches.length} decisions...`);
  try {
    const decisions = matches.map((match) => {
      const supplierItem = supplierItemMap.get(match.targetId);
      return {
        matchCandidateId: match.id,
        storePartNumber: match.storeItem.partNumber,
        supplierPartNumber: supplierItem?.partNumber || '',
        lineCode: supplierItem?.lineCode || null,
        decision: (status === 'ACCEPTED' ? 'approve' : 'reject') as 'approve' | 'reject',
        projectId,
        userId,
      };
    }).filter(d => d.supplierPartNumber); // Only create rules if we have supplier part number

    console.log(`[BULK_OPERATIONS] Prepared ${decisions.length} decisions for learning`);
    if (decisions.length > 0) {
      console.log(`[BULK_OPERATIONS] Sample decision:`, JSON.stringify(decisions[0], null, 2));
      const result = await learnFromBulkDecisions(decisions);
      console.log(`[BULK_OPERATIONS] Created ${result.created} master rules from bulk ${status} (${result.skipped} skipped, ${result.errors} errors)`);
    }
  } catch (error) {
    console.error('[BULK_OPERATIONS] Error creating master rules:', error);
    if (error instanceof Error) {
      console.error('[BULK_OPERATIONS] Error stack:', error.stack);
    }
    // Don't fail the whole operation if rule creation fails
  }

  // Log activity
  await logActivity({
    userId,
    projectId,
    action: status === 'ACCEPTED' ? ActivityType.BULK_ACCEPT : ActivityType.BULK_REJECT,
    details: {
      matchIds,
      count: matches.length,
      status,
    },
    ipAddress: httpRequest.headers.get('x-forwarded-for') || httpRequest.headers.get('x-real-ip'),
  });

  return NextResponse.json({
    success: true,
    operation: 'update_status',
    status,
    updated: matches.length,
    matchIds,
  });
}

/**
 * Handle bulk vendor action update
 */
async function handleUpdateVendorAction(
  projectId: string,
  request: BulkUpdateVendorActionRequest,
  userId: string,
  httpRequest: NextRequest
): Promise<NextResponse> {
  const { matchIds, vendorAction } = request;

  // Validate vendor action enum
  const validActions: VendorAction[] = ['NONE', 'LIFT', 'REBOX', 'UNKNOWN', 'CONTACT_VENDOR'];
  if (!validActions.includes(vendorAction)) {
    return NextResponse.json(
      { error: `Invalid vendor action. Must be one of: ${validActions.join(', ')}` },
      { status: 400 }
    );
  }

  // Perform bulk update
  const result = await prisma.matchCandidate.updateMany({
    where: {
      id: { in: matchIds },
      projectId,
    },
    data: {
      vendorAction,
      updatedAt: new Date(),
    },
  });

  console.log(
    `[BULK_OPERATIONS] Updated ${result.count} matches with vendor action ${vendorAction} for project ${projectId}`
  );

  // Log activity
  await logActivity({
    userId,
    projectId,
    action: ActivityType.BULK_SET_VENDOR_ACTION,
    details: {
      matchIds,
      count: result.count,
      vendorAction,
    },
    ipAddress: httpRequest.headers.get('x-forwarded-for') || httpRequest.headers.get('x-real-ip'),
  });

  return NextResponse.json({
    success: true,
    operation: 'update_vendor_action',
    vendorAction,
    updated: result.count,
    matchIds,
  });
}
