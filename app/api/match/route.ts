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

    console.log(`[MATCH] Starting matching for project: ${projectId}`);
    
    // Get all store and supplier items
    const storeItems = await prisma.storeItem.findMany({
      where: { projectId },
    });
    console.log(`[MATCH] Found ${storeItems.length} store items`);

    const supplierItems = await prisma.supplierItem.findMany({
      where: { projectId },
    });
    console.log(`[MATCH] Found ${supplierItems.length} supplier items`);

    const interchanges = await prisma.interchange.findMany({
      where: { projectId },
    });
    console.log(`[MATCH] Found ${interchanges.length} interchanges`);

    // Clear existing match candidates
    await prisma.matchCandidate.deleteMany({
      where: { projectId },
    });

    const matches: any[] = [];
    let interchangeMatches = 0;
    let exactMatches = 0;
    let fuzzyMatches = 0;

    // Stage 1: Known Interchange Matching
    console.log(`[MATCH] Stage 1: Interchange Matching`);
    for (const storeItem of storeItems) {
      const interchange = interchanges.find(
        (i) => i.oursPartNumber === storeItem.partNumber
      );
      
      if (interchange) {
        const supplierItem = supplierItems.find(
          (s) => s.partNumber === interchange.theirsPartNumber
        );
        
        if (supplierItem) {
          interchangeMatches++;
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
        }
      }
    }
    console.log(`[MATCH] Stage 1 complete: ${interchangeMatches} matches`);

    // Stage 2: Exact Normalized Part Number Match
    console.log(`[MATCH] Stage 2: Exact Normalized Matching`);
    const matchedStoreIds = new Set(matches.map((m) => m.storeItemId));
    
    for (const storeItem of storeItems) {
      if (matchedStoreIds.has(storeItem.id)) continue;
      
      const exactMatch = supplierItems.find(
        (s) => s.partNumberNorm === storeItem.partNumberNorm
      );
      
      if (exactMatch) {
        exactMatches++;
        matchedStoreIds.add(storeItem.id);
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
      }
    }
    console.log(`[MATCH] Stage 2 complete: ${exactMatches} matches`);

    // Stage 3: Fuzzy Matching (for remaining unmatched items)
    console.log(`[MATCH] Stage 3: Fuzzy Matching`);
    const unmatchedStoreItems = storeItems.filter((s) => !matchedStoreIds.has(s.id));
    console.log(`[MATCH] ${unmatchedStoreItems.length} unmatched items remaining`);

    // Only run fuzzy matching on first 1000 items to avoid timeout
    const itemsToMatch = unmatchedStoreItems.slice(0, 1000);
    
    for (const storeItem of itemsToMatch) {
      let bestMatch: any = null;
      let bestScore = 0;

      for (const supplierItem of supplierItems) {
        // Compare normalized part numbers
        const partScore = similarity(storeItem.partNumberNorm, supplierItem.partNumberNorm);
        
        // Compare descriptions if available
        let descScore = 0;
        if (storeItem.description && supplierItem.description) {
          descScore = similarity(
            storeItem.description.toLowerCase(), 
            supplierItem.description.toLowerCase()
          );
        }
        
        // Weighted score
        const score = partScore * 0.7 + descScore * 0.3;
        
        if (score > bestScore && score >= 0.70) {
          bestScore = score;
          bestMatch = supplierItem;
        }
      }

      if (bestMatch) {
        fuzzyMatches++;
        matches.push({
          projectId,
          storeItemId: storeItem.id,
          targetType: 'SUPPLIER',
          targetId: bestMatch.id,
          method: 'FUZZY',
          confidence: bestScore,
          features: { 
            partSimilarity: similarity(storeItem.partNumberNorm, bestMatch.partNumberNorm),
            descSimilarity: storeItem.description && bestMatch.description 
              ? similarity(storeItem.description.toLowerCase(), bestMatch.description.toLowerCase())
              : 0
          },
          status: 'PENDING',
        });
      }
    }
    console.log(`[MATCH] Stage 3 complete: ${fuzzyMatches} matches`);

    // Save all matches
    console.log(`[MATCH] Total matches: ${matches.length}`);
    console.log(`[MATCH] Breakdown: Interchange=${interchangeMatches}, Exact=${exactMatches}, Fuzzy=${fuzzyMatches}`);
    
    if (matches.length > 0) {
      await prisma.matchCandidate.createMany({
        data: matches,
      });
      console.log(`[MATCH] Saved ${matches.length} match candidates`);
    }

    return NextResponse.json({
      success: true,
      message: `Created ${matches.length} match candidates`,
      matchCount: matches.length,
      breakdown: {
        interchange: interchangeMatches,
        exact: exactMatches,
        fuzzy: fuzzyMatches,
      },
    });
  } catch (error: any) {
    console.error('[MATCH] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to run matching' },
      { status: 500 }
    );
  }
}
