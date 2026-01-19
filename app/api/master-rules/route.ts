/**
 * Master Rules Management API
 * 
 * GET /api/master-rules - List all master rules with filtering
 * POST /api/master-rules - Create a new master rule manually
 * PATCH /api/master-rules - Enable/disable a rule
 * DELETE /api/master-rules - Delete a rule
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/app/lib/auth-helpers';
import { getMasterRules, enableRule, disableRule, deleteRule } from '@/app/lib/master-rules-learner';
import { prisma } from '@/app/lib/db/prisma';
import { MasterRuleType, MasterRuleScope } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    
    const { searchParams } = new URL(req.url);
    const enabled = searchParams.get('enabled');
    const ruleType = searchParams.get('ruleType') as MasterRuleType | null;
    const scope = searchParams.get('scope') as MasterRuleScope | null;
    const projectId = searchParams.get('projectId');
    const search = searchParams.get('search');
    
    const filters: any = {};
    if (enabled !== null) filters.enabled = enabled === 'true';
    if (ruleType) filters.ruleType = ruleType;
    if (scope) filters.scope = scope;
    if (projectId) filters.projectId = projectId;
    if (search) filters.search = search;
    
    const rules = await getMasterRules(filters);
    
    return NextResponse.json({
      success: true,
      rules,
      count: rules.length,
    });
  } catch (error: any) {
    console.error('[MASTER-RULES-API] GET error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch rules' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { profile } = await requireAuth();
    
    const body = await req.json();
    const {
      ruleType,
      scope,
      storePartNumber,
      supplierPartNumber,
      lineCode,
      projectId,
    } = body;
    
    if (!ruleType || !storePartNumber) {
      return NextResponse.json(
        { success: false, error: 'Rule type and store part number required' },
        { status: 400 }
      );
    }
    
    if (ruleType === 'POSITIVE_MAP' && !supplierPartNumber) {
      return NextResponse.json(
        { success: false, error: 'Supplier part number required for POSITIVE_MAP rules' },
        { status: 400 }
      );
    }
    
    const rule = await prisma.masterRule.create({
      data: {
        ruleType,
        scope: scope || 'GLOBAL',
        storePartNumber,
        supplierPartNumber: supplierPartNumber || null,
        lineCode: lineCode || null,
        confidence: 1.0,
        enabled: true,
        createdBy: profile.id,
        projectId: projectId || null,
        updatedAt: new Date(),
      }
    });
    
    return NextResponse.json({
      success: true,
      rule,
    });
  } catch (error: any) {
    console.error('[MASTER-RULES-API] POST error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create rule' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireAuth();
    
    const body = await req.json();
    const { ruleId, enabled } = body;
    
    if (!ruleId || enabled === undefined) {
      return NextResponse.json(
        { success: false, error: 'Rule ID and enabled status required' },
        { status: 400 }
      );
    }
    
    const success = enabled ? await enableRule(ruleId) : await disableRule(ruleId);
    
    if (!success) {
      return NextResponse.json(
        { success: false, error: 'Failed to update rule' },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      success: true,
      message: `Rule ${enabled ? 'enabled' : 'disabled'} successfully`,
    });
  } catch (error: any) {
    console.error('[MASTER-RULES-API] PATCH error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update rule' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireAuth();
    
    const { searchParams } = new URL(req.url);
    const ruleId = searchParams.get('ruleId');
    
    if (!ruleId) {
      return NextResponse.json(
        { success: false, error: 'Rule ID required' },
        { status: 400 }
      );
    }
    
    const success = await deleteRule(ruleId);
    
    if (!success) {
      return NextResponse.json(
        { success: false, error: 'Failed to delete rule' },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      success: true,
      message: 'Rule deleted successfully',
    });
  } catch (error: any) {
    console.error('[MASTER-RULES-API] DELETE error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete rule' },
      { status: 500 }
    );
  }
}
