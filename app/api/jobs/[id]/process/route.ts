/**
 * Job Processor API
 * POST /api/jobs/[id]/process - Process next chunk of a job
 * 
 * This endpoint processes jobs in small chunks to avoid Vercel timeouts.
 * It should be called repeatedly until the job is complete.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import prisma from '@/app/lib/db/prisma';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const CHUNK_SIZE = 10; // Process 10 items per chunk to stay under timeout

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const jobId = params.id;

    // Get job
    const job = await prisma.matchingJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      return NextResponse.json(
        { success: false, error: 'Job not found' },
        { status: 404 }
      );
    }

    // Check if job is already completed or failed
    if (job.status === 'completed' || job.status === 'failed') {
      return NextResponse.json({
        success: true,
        job: {
          id: job.id,
          status: job.status,
          processedItems: job.processedItems,
          totalItems: job.totalItems,
          matchesFound: job.matchesFound,
        },
        message: `Job already ${job.status}`,
      });
    }

    // Update job status to processing if it's pending
    if (job.status === 'pending') {
      await prisma.matchingJob.update({
        where: { id: jobId },
        data: {
          status: 'processing',
          startedAt: new Date(),
        },
      });
    }

    const config = job.config as any || {};
    const jobType = config.jobType || 'ai'; // 'ai' or 'web-search'

    console.log(`[JOB-PROCESS] Processing chunk for job ${jobId}, type: ${jobType}`);
    console.log(`[JOB-PROCESS] Current progress: ${job.processedItems}/${job.totalItems}`);

    // Get unmatched items
    const existingMatches = await prisma.matchCandidate.findMany({
      where: { projectId: job.projectId },
      select: { storeItemId: true },
    });
    const matchedIds = new Set(existingMatches.map((m) => m.storeItemId));

    const allUnmatchedItems = await prisma.storeItem.findMany({
      where: {
        projectId: job.projectId,
        id: { notIn: Array.from(matchedIds) },
      },
      orderBy: { partNumber: 'asc' },
    });

    // Calculate which chunk to process
    const startIdx = job.processedItems;
    const endIdx = Math.min(startIdx + CHUNK_SIZE, allUnmatchedItems.length);
    const chunk = allUnmatchedItems.slice(startIdx, endIdx);

    console.log(`[JOB-PROCESS] Processing items ${startIdx} to ${endIdx} (${chunk.length} items)`);

    if (chunk.length === 0) {
      // Job is complete
      await prisma.matchingJob.update({
        where: { id: jobId },
        data: {
          status: 'completed',
          completedAt: new Date(),
          processedItems: job.totalItems || 0,
          progressPercentage: 100,
        },
      });

      console.log(`[JOB-PROCESS] Job ${jobId} completed`);

      return NextResponse.json({
        success: true,
        job: {
          id: job.id,
          status: 'completed',
          processedItems: job.totalItems || 0,
          totalItems: job.totalItems || 0,
          matchesFound: job.matchesFound,
        },
        message: 'Job completed',
      });
    }

    // Get supplier items for matching
    const supplierItems = await prisma.supplierItem.findMany({
      where: { projectId: job.projectId },
    });

    let newMatches = 0;

    // Process chunk based on job type
    if (jobType === 'ai') {
      newMatches = await processAIChunk(chunk, supplierItems, job.projectId);
    } else if (jobType === 'web-search') {
      newMatches = await processWebSearchChunk(chunk, supplierItems, job.projectId);
    }

    // Update job progress
    const newProcessedItems = endIdx;
    const totalItems = job.totalItems || 0;
    const progressPercentage = totalItems > 0 ? (newProcessedItems / totalItems) * 100 : 0;
    const newMatchesFound = job.matchesFound + newMatches;
    const matchRate = newProcessedItems > 0 ? (newMatchesFound / newProcessedItems) * 100 : 0;

    // Estimate completion time
    const elapsedMs = Date.now() - (job.startedAt?.getTime() || Date.now());
    const itemsPerMs = newProcessedItems / elapsedMs;
    const remainingItems = totalItems - newProcessedItems;
    const estimatedRemainingMs = remainingItems / itemsPerMs;
    const estimatedCompletion = new Date(Date.now() + estimatedRemainingMs);

    await prisma.matchingJob.update({
      where: { id: jobId },
      data: {
        processedItems: newProcessedItems,
        progressPercentage,
        matchesFound: newMatchesFound,
        matchRate,
        estimatedCompletion,
      },
    });

    console.log(`[JOB-PROCESS] Chunk complete. Progress: ${newProcessedItems}/${totalItems} (${progressPercentage.toFixed(1)}%)`);
    console.log(`[JOB-PROCESS] New matches: ${newMatches}, Total matches: ${newMatchesFound}`);

    return NextResponse.json({
      success: true,
      job: {
        id: job.id,
        status: 'processing',
        processedItems: newProcessedItems,
        totalItems: totalItems,
        progressPercentage,
        matchesFound: newMatchesFound,
        matchRate,
        estimatedCompletion,
      },
      message: `Processed ${chunk.length} items, ${newMatches} new matches`,
    });

  } catch (error: any) {
    console.error('[JOB-PROCESS] Error:', error);

    // Update job status to failed
    try {
      await prisma.matchingJob.update({
        where: { id: params.id },
        data: {
          status: 'failed',
          completedAt: new Date(),
        },
      });
    } catch (updateError) {
      console.error('[JOB-PROCESS] Failed to update job status:', updateError);
    }

    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * Process a chunk of items using AI matching
 */
async function processAIChunk(
  storeItems: any[],
  supplierItems: any[],
  projectId: string
): Promise<number> {
  let matchCount = 0;

  for (const storeItem of storeItems) {
    try {
      const prompt = `You are an automotive parts matching expert. Match this store inventory item to the most likely supplier part.

Store Item:
- Part Number: ${storeItem.partNumber}
- Description: ${storeItem.description || 'N/A'}
- Line Code: ${storeItem.lineCode || 'N/A'}

Supplier Catalog (first 100 items):
${supplierItems.slice(0, 100).map((s, idx) => `${idx + 1}. ${s.partNumber}${s.description ? ` - ${s.description}` : ''}`).join('\n')}

Respond with ONLY a JSON object in this exact format:
{
  "match": true/false,
  "supplierPartNumber": "PART123" or null,
  "confidence": 0.0-1.0,
  "reason": "Brief explanation"
}`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4.1-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 200,
      });

      const responseText = completion.choices[0]?.message?.content?.trim() || '{}';
      const aiResponse = JSON.parse(responseText);

      if (aiResponse.match && aiResponse.supplierPartNumber) {
        const supplier = supplierItems.find(
          (s) => s.partNumber === aiResponse.supplierPartNumber
        );

        if (supplier) {
          await prisma.matchCandidate.create({
            data: {
              projectId,
              storeItemId: storeItem.id,
              targetType: 'SUPPLIER',
              targetId: supplier.id,
              method: 'AI',
              confidence: aiResponse.confidence || 0.8,
              matchStage: 3,
              status: 'PENDING',
              features: {
                aiReason: aiResponse.reason,
                model: 'gpt-4.1-mini',
              },
            },
          });

          matchCount++;
          console.log(`[AI-MATCH] Found match: ${storeItem.partNumber} -> ${supplier.partNumber} (${aiResponse.confidence})`);
        }
      }
    } catch (error) {
      console.error(`[AI-MATCH] Error processing ${storeItem.partNumber}:`, error);
    }
  }

  return matchCount;
}

/**
 * Process a chunk of items using web search matching
 */
async function processWebSearchChunk(
  storeItems: any[],
  supplierItems: any[],
  projectId: string
): Promise<number> {
  let matchCount = 0;

  for (const storeItem of storeItems) {
    try {
      // Simulate web search with AI (placeholder - implement actual web search logic)
      const prompt = `Find the best matching part number for: ${storeItem.partNumber} ${storeItem.description || ''}`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4.1-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 100,
      });

      const responseText = completion.choices[0]?.message?.content?.trim() || '';
      
      // Try to find matching supplier item
      const matchedSupplier = supplierItems.find((s) =>
        responseText.toLowerCase().includes(s.partNumber.toLowerCase())
      );

      if (matchedSupplier) {
        await prisma.matchCandidate.create({
          data: {
            projectId,
            storeItemId: storeItem.id,
            targetType: 'SUPPLIER',
            targetId: matchedSupplier.id,
            method: 'WEB_SEARCH',
            confidence: 0.85,
            matchStage: 4,
            status: 'PENDING',
            features: {
              searchResult: responseText,
            },
          },
        });

        matchCount++;
        console.log(`[WEB-SEARCH] Found match: ${storeItem.partNumber} -> ${matchedSupplier.partNumber}`);
      }
    } catch (error) {
      console.error(`[WEB-SEARCH] Error processing ${storeItem.partNumber}:`, error);
    }
  }

  return matchCount;
}
