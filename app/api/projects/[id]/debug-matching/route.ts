/**
 * Debug Matching API - Check why no matches found
 * GET /api/projects/[id]/debug-matching
 */

import { NextRequest, NextResponse } from 'next/server';
// Migrated to Supabase auth
import prisma from '@/app/lib/db/prisma';

import { withAuth } from '@/app/lib/middleware/auth';
import { apiLogger } from '@/app/lib/structured-logger';

export const dynamic = 'force-dynamic';
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return withAuth(request, async (context) => {
    try {
    // Require authentication

    const projectId = params.id;

    // Get all interchanges
    const interchanges = await prisma.interchange.findMany({
      where: { projectId },
    });

    // Check if interchange part numbers exist in store items
    const interchangeChecks = await Promise.all(
      interchanges.slice(0, 10).map(async (interchange) => {
        const storeItem = await prisma.storeItem.findFirst({
          where: {
            projectId,
            partNumber: interchange.oursPartNumber,
          },
        });

        const supplierItem = await prisma.supplierItem.findFirst({
          where: {
            projectId,
            partNumber: interchange.theirsPartNumber,
          },
        });

        return {
          interchange: {
            ours: interchange.oursPartNumber,
            theirs: interchange.theirsPartNumber,
          },
          storeItemFound: !!storeItem,
          supplierItemFound: !!supplierItem,
          storeItem: storeItem ? {
            partNumber: storeItem.partNumber,
            partNumberNorm: storeItem.partNumberNorm,
          } : null,
          supplierItem: supplierItem ? {
            partNumber: supplierItem.partNumber,
            partNumberNorm: supplierItem.partNumberNorm,
          } : null,
        };
      })
    );

    // Get some sample part numbers for comparison
    const sampleStore = await prisma.storeItem.findMany({
      where: { projectId },
      take: 20,
      select: { partNumber: true, partNumberNorm: true },
    });

    const sampleSupplier = await prisma.supplierItem.findMany({
      where: { projectId },
      take: 20,
      select: { partNumber: true, partNumberNorm: true },
    });

    // Check for any exact normalized matches
    const storeNorms = sampleStore.map(s => s.partNumberNorm);
    const supplierNorms = sampleSupplier.map(s => s.partNumberNorm);
    const exactMatches = storeNorms.filter(n => supplierNorms.includes(n));

    return NextResponse.json({
      success: true,
      counts: {
        interchanges: interchanges.length,
        storeItems: await prisma.storeItem.count({ where: { projectId } }),
        supplierItems: await prisma.supplierItem.count({ where: { projectId } }),
      },
      interchangeChecks,
      sampleStore,
      sampleSupplier,
      exactMatches,
      analysis: {
        interchangesWork: interchangeChecks.filter(c => c.storeItemFound && c.supplierItemFound).length > 0,
        storeItemsFoundInInterchanges: interchangeChecks.filter(c => c.storeItemFound).length,
        supplierItemsFoundInInterchanges: interchangeChecks.filter(c => c.supplierItemFound).length,
      },
    });
  
  } catch (error: any) {
    apiLogger.error({ error: error.message }, 'Handler error');
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
  });
}
