import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface LogActivityParams {
  userId: string;
  projectId?: string | null;
  action: string;
  details: Record<string, any>;
  ipAddress?: string | null;
}

/**
 * Log an activity to the ActivityLog table
 * 
 * @example
 * await logActivity({
 *   userId: session.user.id,
 *   projectId: 'project123',
 *   action: 'BULK_ACCEPT',
 *   details: { matchIds: ['m1', 'm2'], count: 2 },
 *   ipAddress: request.headers.get('x-forwarded-for'),
 * });
 */
export async function logActivity(params: LogActivityParams): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: {
        userId: params.userId,
        projectId: params.projectId || null,
        action: params.action,
        details: params.details,
        ipAddress: params.ipAddress || null,
      },
    });
  } catch (error) {
    console.error('[Logger] Failed to log activity:', error);
    // Don't throw - logging failures shouldn't break the main operation
  }
}

/**
 * Common activity types for consistency
 */
export const ActivityType = {
  // User Management
  USER_ROLE_CHANGED: 'USER_ROLE_CHANGED',
  PASSWORD_RESET_SENT: 'PASSWORD_RESET_SENT',
  USER_CREATED: 'USER_CREATED',
  USER_DELETED: 'USER_DELETED',
  
  // Bulk Operations (Epic B1)
  BULK_ACCEPT: 'BULK_ACCEPT',
  BULK_REJECT: 'BULK_REJECT',
  BULK_SET_VENDOR_ACTION: 'BULK_SET_VENDOR_ACTION',
  
  // Rules Management
  RULE_CREATED: 'RULE_CREATED',
  RULE_UPDATED: 'RULE_UPDATED',
  RULE_DELETED: 'RULE_DELETED',
  
  // File Operations
  FILE_UPLOADED: 'FILE_UPLOADED',
  FILE_IMPORTED: 'FILE_IMPORTED',
  FILE_EXPORTED: 'FILE_EXPORTED',
  
  // Match Operations
  MATCH_ACCEPTED: 'MATCH_ACCEPTED',
  MATCH_REJECTED: 'MATCH_REJECTED',
  MATCH_VENDOR_ACTION_SET: 'MATCH_VENDOR_ACTION_SET',
  
  // Project Operations
  PROJECT_CREATED: 'PROJECT_CREATED',
  PROJECT_UPDATED: 'PROJECT_UPDATED',
  PROJECT_DELETED: 'PROJECT_DELETED',
  
  // Job Operations
  JOB_STARTED: 'JOB_STARTED',
  JOB_COMPLETED: 'JOB_COMPLETED',
  JOB_FAILED: 'JOB_FAILED',
} as const;
