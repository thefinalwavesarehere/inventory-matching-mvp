/**
 * P3: Line Code Normalization API
 * 
 * POST /api/projects/[id]/normalize-line-codes
 * Applies line code mappings to normalize all part numbers in a project
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/app/lib/auth-helpers';
import { normalizeInventoryItems, normalizeSupplierItems } from '@/app/lib/line-code-normalizer';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();

    const projectId = params.id;

    console.log(`[NORMALIZE] Starting line code normalization for project ${projectId}`);

    // Normalize inventory items
    const inventoryResult = await normalizeInventoryItems(projectId);
    console.log(`[NORMALIZE] Inventory: ${inventoryResult.normalizedCount}/${inventoryResult.totalItems} normalized`);

    // Normalize supplier items
    const supplierResult = await normalizeSupplierItems(projectId);
    console.log(`[NORMALIZE] Supplier: ${supplierResult.normalizedCount}/${supplierResult.totalItems} normalized`);

    return NextResponse.json({
      success: true,
      inventory: inventoryResult,
      supplier: supplierResult,
      totalNormalized: inventoryResult.normalizedCount + supplierResult.normalizedCount,
      totalItems: inventoryResult.totalItems + supplierResult.totalItems,
    });
  } catch (error: any) {
    console.error('[NORMALIZE] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to normalize line codes' },
      { status: 500 }
    );
  }
}
