/**
 * Matching API
 * 
 * GET  /api/match?projectId=xxx - Get match candidates for project
 * POST /api/match - Run matching algorithm
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import prisma from '@/app/lib/db/prisma';

// Simple string similarity (Levenshtein distance)
function similarity(s1: string, s2: string): number {
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  
  if (longer.length === 0) return 1.0;
  
  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

function levenshteinDistance(s1: string, s2: string): number {
  const costs: number[] = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    const status = searchParams.get('status');

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: 'Project ID required' },
        { status: 400 }
      );
    }

    // Get match candidates
    const whereClause: any = { projectId };
    if (status && status !== 'all') {
      whereClause.status = status.toUpperCase();
    }

    const matches = await prisma.matchCandidate.findMany({
      where: whereClause,
      include: {
        storeItem: true,
      },
      orderBy: { confidence: 'desc' },
    });

    // Fetch target items (supplier or inventory)
    const matchesWithTargets = await Promise.all(
      matches.map(async (m) => {
        let targetItem = null;
        if (m.targetType === 'SUPPLIER') {
          targetItem = await prisma.supplierItem.findUnique({
            where: { id: m.targetId },
          });
        } else if (m.targetType === 'INVENTORY') {
          targetItem = await prisma.inventoryItem.findUnique({
            where: { id: m.targetId },
          });
        }

        return {
          id: m.id,
          storeItem: m.storeItem,
          targetItem,
          targetType: m.targetType,
          method: m.method,
          confidence: m.confidence,
          features: m.features,
          status: m.status,
        };
      })
    );

    return NextResponse.json({
      success: true,
      matches: matchesWithTargets,
    });
  } catch (error) {
    console.error('Error fetching matches:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch matches' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { projectId } = body;

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: 'Project ID required' },
        { status: 400 }
      );
    }

    // Get all store and supplier items
    const storeItems = await prisma.storeItem.findMany({
      where: { projectId },
    });

    const supplierItems = await prisma.supplierItem.findMany({
      where: { projectId },
    });

    const interchanges = await prisma.interchange.findMany({
      where: { projectId },
    });

    // Clear existing match candidates
    await prisma.matchCandidate.deleteMany({
      where: { projectId },
    });

    const matches: any[] = [];

    // Stage 1: Known Interchange Matching
    for (const storeItem of storeItems) {
      const interchange = interchanges.find(
        (i) => i.oursPartNumber === storeItem.partNumber
      );
      
      if (interchange) {
        const supplierItem = supplierItems.find(
          (s) => s.partNumber === interchange.theirsPartNumber
        );
        
        if (supplierItem) {
          matches.push({
            projectId,
            storeItemId: storeItem.id,
            targetType: 'SUPPLIER',
            targetId: supplierItem.id,
            method: 'INTERCHANGE',
            confidence: 1.0,
            features: { reason: 'Known interchange match' },
            status: 'PENDING',
          });
          continue;
        }
      }

      // Stage 2: Exact Normalized Part Number Match
      const exactMatch = supplierItems.find(
        (s) => s.partNumberNorm === storeItem.partNumberNorm
      );
      
      if (exactMatch) {
        matches.push({
          projectId,
          storeItemId: storeItem.id,
          targetType: 'SUPPLIER',
          targetId: exactMatch.id,
          method: 'EXACT_NORM',
          confidence: 0.95,
          features: { reason: 'Exact normalized part number match' },
          status: 'PENDING',
        });
        continue;
      }

      // Stage 3: Line Code + Part Number Match
      if (storeItem.lineCode) {
        const lineMatch = supplierItems.find(
          (s) => s.lineCode === storeItem.lineCode && s.partNumberNorm === storeItem.partNumberNorm
        );
        
        if (lineMatch) {
          matches.push({
            projectId,
            storeItemId: storeItem.id,
            targetType: 'SUPPLIER',
            targetId: lineMatch.id,
            method: 'LINE_PN',
            confidence: 0.90,
            features: { reason: 'Line code + part number match' },
            status: 'PENDING',
          });
          continue;
        }
      }
    }

    // Stage 4: Fuzzy Matching (for remaining unmatched items)
    const matchedStoreIds = new Set(matches.map((m) => m.storeItemId));
    const unmatchedStoreItems = storeItems.filter((s) => !matchedStoreIds.has(s.id));

    for (const storeItem of unmatchedStoreItems) {
      let bestMatch: any = null;
      let bestScore = 0;

      for (const supplierItem of supplierItems) {
        // Compare normalized part numbers
        const partScore = similarity(storeItem.partNumberNorm, supplierItem.partNumberNorm);
        
        // Compare descriptions if available
        let descScore = 0;
        if (storeItem.description && supplierItem.description) {
          descScore = similarity(storeItem.description, supplierItem.description);
        }
        
        // Weighted score
        const score = partScore * 0.7 + descScore * 0.3;
        
        if (score > bestScore && score >= 0.65) {
          bestScore = score;
          bestMatch = supplierItem;
        }
      }

      if (bestMatch) {
        let method = 'FUZZY_SUBSTRING';
        if (bestScore >= 0.85) method = 'DESC_SIM';

        matches.push({
          projectId,
          storeItemId: storeItem.id,
          targetType: 'SUPPLIER',
          targetId: bestMatch.id,
          method,
          confidence: bestScore,
          features: { 
            partSimilarity: similarity(storeItem.partNumberNorm, bestMatch.partNumberNorm),
            descSimilarity: storeItem.description && bestMatch.description 
              ? similarity(storeItem.description, bestMatch.description)
              : 0
          },
          status: 'PENDING',
        });
      }
    }

    // Save all matches
    if (matches.length > 0) {
      await prisma.matchCandidate.createMany({
        data: matches,
      });
    }

    return NextResponse.json({
      success: true,
      message: `Created ${matches.length} match candidates`,
      matchCount: matches.length,
    });
  } catch (error) {
    console.error('Error running matching:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to run matching' },
      { status: 500 }
    );
  }
}
