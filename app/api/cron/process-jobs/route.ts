/**
 * Vercel Cron Job - Background Job Processor
 * 
 * This endpoint is called by Vercel Cron every minute to process pending jobs.
 * It finds all active jobs and processes one chunk for each job.
 * 
 * Cron schedule: Every 1 minute
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/lib/db/prisma';

export const maxDuration = 60; // Maximum execution time: 60 seconds
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    // Verify this is a cron request (security check)
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      console.log('[CRON] Unauthorized request');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[CRON] Starting job processor...');

    // Find all active jobs
    const activeJobs = await prisma.matchingJob.findMany({
      where: {
        status: { in: ['pending', 'processing'] },
      },
      orderBy: { createdAt: 'asc' },
    });

    console.log(`[CRON] Found ${activeJobs.length} active jobs`);

    if (activeJobs.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No active jobs to process',
      });
    }

    const results = [];

    // Process one chunk for each active job
    for (const job of activeJobs) {
      try {
        console.log(`[CRON] Processing job ${job.id} (${job.currentStageName})`);

        // Call the process endpoint
        const processUrl = `${process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'}/api/jobs/${job.id}/process`;
        
        const response = await fetch(processUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // Pass through a special header to bypass auth for internal calls
            'x-internal-call': process.env.CRON_SECRET || '',
          },
        });

        if (!response.ok) {
          console.error(`[CRON] Failed to process job ${job.id}: ${response.statusText}`);
          results.push({
            jobId: job.id,
            success: false,
            error: response.statusText,
          });
          continue;
        }

        const data = await response.json();
        
        console.log(`[CRON] Job ${job.id} chunk complete: ${data.job?.processedItems}/${data.job?.totalItems} items`);
        
        results.push({
          jobId: job.id,
          success: true,
          status: data.job?.status,
          progress: data.job?.progressPercentage,
        });

      } catch (error: any) {
        console.error(`[CRON] Error processing job ${job.id}:`, error);
        results.push({
          jobId: job.id,
          success: false,
          error: error.message,
        });
      }
    }

    console.log(`[CRON] Processed ${results.length} jobs`);

    return NextResponse.json({
      success: true,
      processed: results.length,
      results,
    });

  } catch (error: any) {
    console.error('[CRON] Fatal error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
