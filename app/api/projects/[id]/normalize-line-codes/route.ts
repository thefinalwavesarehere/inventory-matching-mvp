/**
 * P3: Line Code Normalization API
 * 
 * POST /api/projects/[id]/normalize-line-codes
 * Applies line code mappings to normalize all part numbers in a project
 */

import { NextRequest, NextResponse } from 'next/server';
import { normalizeInventoryItems, normalizeSupplierItems } from '@/app/lib/line-code-normalizer';

import { withAuth } from '@/app/lib/middleware/auth';
import { apiLogger } from '@/app/lib/structured-logger';
export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  return withAuth(req, async (context) => {
    try {

    const projectId = params.id;

    apiLogger.info(`[NORMALIZE] Starting line code normalization for project ${projectId}`);

    // Normalize inventory items
    const inventoryResult = await normalizeInventoryItems(projectId);
    apiLogger.info(`[NORMALIZE] Inventory: ${inventoryResult.normalizedCount}/${inventoryResult.totalItems} normalized`);

    // Normalize supplier items
    const supplierResult = await normalizeSupplierItems(projectId);
    apiLogger.info(`[NORMALIZE] Supplier: ${supplierResult.normalizedCount}/${supplierResult.totalItems} normalized`);

    return NextResponse.json({
      success: true,
      inventory: inventoryResult,
      supplier: supplierResult,
      totalNormalized: inventoryResult.normalizedCount + supplierResult.normalizedCount,
      totalItems: inventoryResult.totalItems + supplierResult.totalItems,
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
