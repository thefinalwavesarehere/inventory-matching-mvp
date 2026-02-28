/**
 * Debug API - Inspect imported data
 * GET /api/projects/[id]/debug
 */

import { NextRequest, NextResponse } from 'next/server';
// Migrated to Supabase auth
import prisma from '@/app/lib/db/prisma';

import { withAuth } from '@/app/lib/middleware/auth';
import { apiLogger } from '@/app/lib/structured-logger';
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return withAuth(request, async (context) => {
    try {
    // Require authentication

    const projectId = params.id;

    // Get sample data from each table
    const storeItems = await prisma.storeItem.findMany({
      where: { projectId },
      take: 5,
      select: {
        id: true,
        partNumber: true,
        partNumberNorm: true,
        partFull: true,
        description: true,
        lineCode: true,
        rawData: true,
      },
    });

    const supplierItems = await prisma.supplierItem.findMany({
      where: { projectId },
      take: 5,
      select: {
        id: true,
        partNumber: true,
        partNumberNorm: true,
        partFull: true,
        description: true,
        lineCode: true,
        rawData: true,
      },
    });

    const interchanges = await prisma.interchange.findMany({
      where: { projectId },
      take: 5,
    });

    // Get counts
    const counts = {
      storeItems: await prisma.storeItem.count({ where: { projectId } }),
      supplierItems: await prisma.supplierItem.count({ where: { projectId } }),
      interchanges: await prisma.interchange.count({ where: { projectId } }),
    };

    // Get column names from rawData
    const storeColumns = storeItems.length > 0 && storeItems[0].rawData 
      ? Object.keys(storeItems[0].rawData as any)
      : [];
    
    const supplierColumns = supplierItems.length > 0 && supplierItems[0].rawData
      ? Object.keys(supplierItems[0].rawData as any)
      : [];

    return NextResponse.json({
      success: true,
      counts,
      storeColumns,
      supplierColumns,
      samples: {
        storeItems,
        supplierItems,
        interchanges,
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
