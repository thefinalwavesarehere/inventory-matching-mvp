/**
 * @security Protected: Requires ADMIN role for write operations (POST)
 * GET operations are available to all authenticated users
 */

import { NextRequest, NextResponse } from 'next/server';
import { VendorAction } from '@prisma/client';
import { prisma } from '@/app/lib/db/prisma';

import { withAdmin } from '@/app/lib/middleware/auth';
import { apiLogger } from '@/app/lib/structured-logger';
import { CreateRuleSchema, parseBody } from '@/app/lib/schemas';
export const dynamic = 'force-dynamic';

/**
 * GET /api/rules
 * List all global rules (projectId = null)
 * Also supports count-only mode via ?count=true
 */
export async function GET(request: NextRequest) {
  try {
    // Check if count-only mode
    const url = new URL(request.url);
    const countOnly = url.searchParams.get('count') === 'true';

    if (countOnly) {
      const count = await prisma.matchingRule.count({
        where: { active: true },
      });
      return NextResponse.json({
        success: true,
        count,
      });
    }

    const rules = await prisma.vendorActionRule.findMany({
      where: {
        projectId: null,
      },
      orderBy: [
        { supplierLineCode: 'asc' },
        { createdAt: 'desc' },
      ],
    });

    return NextResponse.json({
      success: true,
      rules: rules.map(rule => ({
        ...rule,
        scope: 'global',
      })),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/rules
 * Create a new global rule (admin only)
 */
export async function POST(request: NextRequest) {
  return withAdmin(request, async (context) => {
    try {
    // Require admin role for creating global rules
    
    const body = await request.json();
    const parsed = parseBody(CreateRuleSchema, body);
    if (!parsed.success) return parsed.response;
    const { supplierLineCode, categoryPattern, subcategoryPattern, action, active } = parsed.data;

    // Create global rule (projectId = null)
    const rule = await prisma.vendorActionRule.create({
      data: {
        projectId: null, // Global rule
        supplierLineCode: supplierLineCode.trim().toUpperCase(),
        categoryPattern: categoryPattern.trim(),
        subcategoryPattern: subcategoryPattern.trim(),
        action: action as VendorAction,
        active,
      },
    });

    return NextResponse.json({
      success: true,
      rule: {
        ...rule,
        scope: 'global',
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
