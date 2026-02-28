/**
 * P4: Budget Management API
 *
 * GET  /api/projects/:id/budget - Get budget status and cost summary
 * PUT  /api/projects/:id/budget - Update budget limit
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/db/prisma';
import { getBudgetStatus, getCostSummary } from '@/app/lib/budget-tracker';

import { withAuth } from '@/app/lib/middleware/auth';
import { apiLogger } from '@/app/lib/structured-logger';
export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  return withAuth(req, async (context) => {
    try {

    const projectId = params.id;

    // Verify project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      return NextResponse.json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      );
    }

    // Get cost summary
    const costSummary = await getCostSummary(projectId);

    return NextResponse.json({
      success: true,
      ...costSummary,
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

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  return withAuth(req, async (context) => {
    try {

    const projectId = params.id;
    const body = await req.json();
    const { budgetLimit } = body;

    if (budgetLimit !== null && budgetLimit !== undefined) {
      if (typeof budgetLimit !== 'number' || budgetLimit < 0) {
        return NextResponse.json(
          { success: false, error: 'Budget limit must be a positive number or null' },
          { status: 400 }
        );
      }
    }

    // Update project budget limit
    const project = await prisma.project.update({
      where: { id: projectId },
      data: {
        budgetLimit: budgetLimit,
      },
    });

    // Get updated budget status
    const budgetStatus = await getBudgetStatus(projectId);

    return NextResponse.json({
      success: true,
      budgetLimit: project.budgetLimit?.toNumber() || null,
      budgetStatus,
      message: budgetLimit === null ? 'Budget limit removed' : `Budget limit set to $${budgetLimit}`,
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
