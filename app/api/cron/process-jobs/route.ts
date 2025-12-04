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

    console.log('[CRON] ========== CRON JOB TRIGGERED ==========');
    console.log(`[CRON] Timestamp: ${new Date().toISOString()}`);
    console.log(`[CRON] NEXT_PUBLIC_URL: ${process.env.NEXT_PUBLIC_URL}`);

    // Find all active jobs
    const activeJobs = await prisma.matchingJob.findMany({
      where: {
        status: { in: ['pending', 'processing'] },
      },
      orderBy: { createdAt: 'asc' },
    });

    console.log(`[CRON] Found ${activeJobs.length} active jobs`);
    if (activeJobs.length > 0) {
      activeJobs.forEach(job => {
        console.log(`[CRON]   - Job ${job.id}: ${job.currentStageName}, status=${job.status}, progress=${job.processedItems}/${job.totalItems}`);
      });
    }

    if (activeJobs.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No active jobs to process',
      });
    }

    const results = [];

    // Process one chunk for each active job (fire-and-forget)
    for (const job of activeJobs) {
      try {
        console.log(`[CRON] ========== Triggering job ${job.id} ==========`);
        console.log(`[CRON] Job name: ${job.currentStageName}`);
        console.log(`[CRON] Job status: ${job.status}`);
        console.log(`[CRON] Job config:`, JSON.stringify(job.config));

        // Call the process endpoint (fire-and-forget - don't wait for response)
        const processUrl = `${process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'}/api/jobs/${job.id}/process`;
        console.log(`[CRON] Triggering process URL: ${processUrl}`);
        
        // Fire-and-forget: trigger the request but don't await the response
        fetch(processUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // Pass through a special header to bypass auth for internal calls
            'x-internal-call': process.env.CRON_SECRET || '',
          },
        }).catch(error => {
          // Log errors but don't block
          console.error(`[CRON] Error triggering job ${job.id}:`, error.message);
        });
        
        console.log(`[CRON] Job ${job.id} triggered successfully (processing in background)`);
        
        results.push({
          jobId: job.id,
          success: true,
          triggered: true,
        });

      } catch (error: any) {
        console.error(`[CRON] ========== ERROR triggering job ${job.id} ==========`);
        console.error(`[CRON] Error type: ${error.constructor.name}`);
        console.error(`[CRON] Error message:`, error.message);
        console.error(`[CRON] Error stack:`, error.stack);
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
