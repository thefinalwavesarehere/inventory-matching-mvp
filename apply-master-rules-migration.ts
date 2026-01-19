import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';

const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL,
});

async function applyMigration() {
  console.log('Applying master rules migration...\n');
  
  const sql = readFileSync('./manual_migration_master_rules.sql', 'utf-8');
  
  // Split by semicolons and execute each statement
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));
  
  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i];
    console.log(`Executing statement ${i + 1}/${statements.length}...`);
    console.log(statement.substring(0, 100) + '...\n');
    
    try {
      await prisma.$executeRawUnsafe(statement);
      console.log('✅ Success\n');
    } catch (error: any) {
      console.error(`❌ Error: ${error.message}\n`);
      // Continue with next statement
    }
  }
  
  console.log('Migration complete!');
  await prisma.$disconnect();
}

applyMigration().catch(console.error);
