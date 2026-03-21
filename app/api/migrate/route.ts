/**
 * Manual migration endpoint — ADMIN ONLY
 *
 * Security hardening:
 *  1. Disabled entirely in production unless ENABLE_MIGRATE_ENDPOINT=true
 *  2. Requires valid Supabase session with ADMIN role (withAdmin middleware)
 *  3. Requires MIGRATION_SECRET in request body (second factor)
 */
import { NextRequest, NextResponse } from 'next/server';
import { apiLogger } from '@/app/lib/structured-logger';
import { prisma } from '@/app/lib/db/prisma';
import { withAdmin } from '@/app/lib/middleware/auth';

export async function POST(request: NextRequest) {
  // Gate 1: disabled in production unless explicitly opted-in
  const isProduction = process.env.NODE_ENV === 'production';
  const enabledInProd = process.env.ENABLE_MIGRATE_ENDPOINT === 'true';
  if (isProduction && !enabledInProd) {
    apiLogger.warn('[MIGRATION] Attempt to call disabled migration endpoint in production');
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Gate 2: require ADMIN session
  return withAdmin(request, async () => {
    try {
      // Gate 3: require migration secret in body
      const body = await request.json();
      const { secret } = body as { secret?: string };
      if (!secret || secret !== process.env.MIGRATION_SECRET) {
        apiLogger.warn('[MIGRATION] Invalid migration secret');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      apiLogger.info('[MIGRATION] Starting Excel review fields migration...');

      await prisma.$executeRaw`
        DO $$ BEGIN
          CREATE TYPE "VendorAction" AS ENUM ('NONE', 'LIFT', 'REBOX', 'UNKNOWN', 'CONTACT_VENDOR');
        EXCEPTION WHEN duplicate_object THEN null;
        END $$
      `;
      await prisma.$executeRaw`
        DO $$ BEGIN
          CREATE TYPE "ReviewSource" AS ENUM ('UI', 'EXCEL');
        EXCEPTION WHEN duplicate_object THEN null;
        END $$
      `;
      await prisma.$executeRaw`
        DO $$ BEGIN
          ALTER TABLE "match_candidates" ADD COLUMN IF NOT EXISTS "vendorAction"                "VendorAction" NOT NULL DEFAULT 'NONE';
          ALTER TABLE "match_candidates" ADD COLUMN IF NOT EXISTS "correctedSupplierPartNumber" TEXT;
          ALTER TABLE "match_candidates" ADD COLUMN IF NOT EXISTS "reviewSource"                "ReviewSource";
          ALTER TABLE "match_candidates" ADD COLUMN IF NOT EXISTS "reviewedAt"                  TIMESTAMP(3);
          ALTER TABLE "match_candidates" ADD COLUMN IF NOT EXISTS "reviewedByUserId"            TEXT;
        END $$
      `;

      apiLogger.info('[MIGRATION] Completed successfully');
      return NextResponse.json({
        success: true,
        message: 'Migration completed successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      apiLogger.error({ error: error.message }, '[MIGRATION] Failed');
      return NextResponse.json(
        { error: 'Migration failed', details: error.message },
        { status: 500 }
      );
    }
  });
}
