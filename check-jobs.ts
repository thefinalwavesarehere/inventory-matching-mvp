import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL,
});

async function checkJobs() {
  console.log('Checking active jobs...\n');
  
  const jobs = await prisma.matchingJob.findMany({
    where: {
      status: {
        in: ['queued', 'pending', 'processing']
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  });
  
  console.log(`Found ${jobs.length} active jobs:\n`);
  
  for (const job of jobs) {
    console.log(`Job ID: ${job.id}`);
    console.log(`  Project ID: ${job.projectId}`);
    console.log(`  Status: ${job.status}`);
    console.log(`  Progress: ${job.processedItems}/${job.totalItems}`);
    console.log(`  Matches: ${job.matchesFound}`);
    console.log(`  Created: ${job.createdAt}`);
    console.log(`  Updated: ${job.updatedAt}`);
    console.log(`  Config: ${JSON.stringify(job.config)}`);
    console.log(`  Cancellation Requested: ${job.cancellationRequested}`);
    console.log('');
  }
  
  await prisma.$disconnect();
}

checkJobs().catch(console.error);
