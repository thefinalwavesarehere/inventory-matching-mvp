import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/db/prisma';


export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');

    if (!projectId) {
      return NextResponse.json(
        { error: 'Project ID is required' },
        { status: 400 }
      );
    }

    // Fetch all matches for the project
    const matches = await prisma.matchCandidate.findMany({
      where: {
        storeItem: {
          projectId,
        },
        status: {
          in: ['PENDING', 'CONFIRMED'],
        },
      },
      select: {
        confidence: true,
      },
    });

    // Calculate confidence distribution with finer increments
    const buckets = {
      '95-100%': 0,
      '85-94%': 0,
      '80-84%': 0,
      '75-79%': 0,
      '70-74%': 0,
      '60-69%': 0,
      'Below 60%': 0,
    };

    matches.forEach(match => {
      const conf = match.confidence;
      if (conf >= 0.95) {
        buckets['95-100%']++;
      } else if (conf >= 0.85) {
        buckets['85-94%']++;
      } else if (conf >= 0.80) {
        buckets['80-84%']++;
      } else if (conf >= 0.75) {
        buckets['75-79%']++;
      } else if (conf >= 0.70) {
        buckets['70-74%']++;
      } else if (conf >= 0.60) {
        buckets['60-69%']++;
      } else {
        buckets['Below 60%']++;
      }
    });

    const total = matches.length;
    const distribution = Object.entries(buckets).map(([range, count]) => ({
      range,
      count,
      percentage: total > 0 ? (count / total) * 100 : 0,
    }));

    return NextResponse.json({
      distribution,
      totalMatches: total,
    });
  } catch (error: any) {
    console.error('Error fetching confidence distribution:', error);
    return NextResponse.json(
      { error: 'Failed to fetch confidence distribution', details: error.message },
      { status: 500 }
    );
  }
}
