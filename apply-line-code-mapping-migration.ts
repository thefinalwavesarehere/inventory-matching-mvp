import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Creating line_code_mappings table...');

  // Create enum
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "LineCodeMappingScope" AS ENUM ('GLOBAL', 'PROJECT_SPECIFIC');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // Create table
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "line_code_mappings" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "sourceLineCode" TEXT NOT NULL,
      "canonicalLineCode" TEXT NOT NULL,
      "scope" "LineCodeMappingScope" NOT NULL DEFAULT 'GLOBAL',
      "projectId" TEXT,
      "createdBy" TEXT NOT NULL,
      "enabled" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "line_code_mappings_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);

  // Create indexes
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "line_code_mappings_sourceLineCode_projectId_key" 
    ON "line_code_mappings"("sourceLineCode", "projectId");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "line_code_mappings_sourceLineCode_idx" 
    ON "line_code_mappings"("sourceLineCode");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "line_code_mappings_enabled_idx" 
    ON "line_code_mappings"("enabled");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "line_code_mappings_scope_idx" 
    ON "line_code_mappings"("scope");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "line_code_mappings_projectId_idx" 
    ON "line_code_mappings"("projectId");
  `);

  console.log('✅ line_code_mappings table created successfully');
}

main()
  .catch((e) => {
    console.error('❌ Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
