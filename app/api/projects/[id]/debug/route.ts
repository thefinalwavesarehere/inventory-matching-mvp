/**
 * Debug API - Inspect imported data
 * GET /api/projects/[id]/debug
 */

import { NextRequest, NextResponse } from 'next/server';
// Migrated to Supabase auth
import { requireAuth } from '@/app/lib/auth-helpers';
import prisma from '@/app/lib/db/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Require authentication
    await requireAuth();

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
    console.error('Error in debug API:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
