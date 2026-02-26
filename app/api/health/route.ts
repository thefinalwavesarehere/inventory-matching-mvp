/**
 * Health Check Endpoint
 * 
 * Provides system health status for monitoring and load balancers.
 * Returns 200 OK if all critical services are operational.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/db/prisma';

export const dynamic = 'force-dynamic';

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  checks: {
    database: {
      status: 'up' | 'down';
      responseTime?: number;
      error?: string;
    };
    memory: {
      used: number;
      total: number;
      percentage: number;
    };
  };
}

export async function GET() {
  const startTime = Date.now();
  const result: HealthCheckResult = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {
      database: {
        status: 'down',
      },
      memory: {
        used: 0,
        total: 0,
        percentage: 0,
      },
    },
  };

  // Check database connectivity
  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const dbResponseTime = Date.now() - dbStart;
    
    result.checks.database = {
      status: 'up',
      responseTime: dbResponseTime,
    };
  } catch (error) {
    result.status = 'unhealthy';
    result.checks.database = {
      status: 'down',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }

  // Check memory usage
  const memUsage = process.memoryUsage();
  result.checks.memory = {
    used: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
    total: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
    percentage: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100),
  };

  // Determine overall status
  if (result.checks.database.status === 'down') {
    result.status = 'unhealthy';
  } else if (result.checks.memory.percentage > 90) {
    result.status = 'degraded';
  }

  const statusCode = result.status === 'healthy' ? 200 : result.status === 'degraded' ? 200 : 503;

  return NextResponse.json(result, { status: statusCode });
}
