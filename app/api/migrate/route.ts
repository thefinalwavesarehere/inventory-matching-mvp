/**
 * Manual migration endpoint for adding Excel review fields
 * Run this once after deployment to add new columns
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/lib/db/prisma';

export async function POST(request: NextRequest) {
  try {
    // Security: Check for migration secret
    const { secret } = await request.json();
    
    if (secret !== process.env.MIGRATION_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[MIGRATION] Starting Excel review fields migration...');

    // Run the migration SQL directly
    await prisma.$executeRawUnsafe(`
      -- Check if VendorAction enum exists, create if not
      DO $$ BEGIN
        CREATE TYPE "VendorAction" AS ENUM ('NONE', 'LIFT', 'REBOX', 'UNKNOWN', 'CONTACT_VENDOR');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await prisma.$executeRawUnsafe(`
      -- Check if ReviewSource enum exists, create if not
      DO $$ BEGIN
        CREATE TYPE "ReviewSource" AS ENUM ('UI', 'EXCEL');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await prisma.$executeRawUnsafe(`
      -- Add columns if they don't exist
      DO $$ BEGIN
        ALTER TABLE "match_candidates" ADD COLUMN IF NOT EXISTS "vendorAction" "VendorAction" NOT NULL DEFAULT 'NONE';
        ALTER TABLE "match_candidates" ADD COLUMN IF NOT EXISTS "correctedSupplierPartNumber" TEXT;
        ALTER TABLE "match_candidates" ADD COLUMN IF NOT EXISTS "reviewSource" "ReviewSource";
        ALTER TABLE "match_candidates" ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3);
        ALTER TABLE "match_candidates" ADD COLUMN IF NOT EXISTS "reviewedByUserId" TEXT;
      END $$;
    `);

    console.log('[MIGRATION] Excel review fields migration completed successfully');

    return NextResponse.json({
      success: true,
      message: 'Migration completed successfully',
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('[MIGRATION] Error running migration:', error);
    return NextResponse.json(
      {
        error: 'Migration failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
