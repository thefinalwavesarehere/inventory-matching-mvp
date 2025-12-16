# Quick Start - Run Database Migrations

## The Problem

Your Vercel deployment is successful, but the database tables don't exist yet. You're seeing this error:

```
The table `public.projects` does not exist in the current database.
```

## The Solution

You need to run the database migration to create all 9 tables in your Supabase database.

## Option 1: Run SQL Script in Supabase (RECOMMENDED - 2 minutes)

This is the fastest way to get your system working.

### Steps:

1. **Open Supabase SQL Editor**
   - Go to https://app.supabase.com
   - Select your project
   - Click "SQL Editor" in the left sidebar
   - Click "New Query"

2. **Copy and Paste the SQL Script**
   - Open the file: `migrations/001_initial_schema.sql`
   - Copy the entire contents
   - Paste into the Supabase SQL Editor

3. **Run the Script**
   - Click "Run" button (or press Ctrl+Enter)
   - Wait for completion (should take 2-3 seconds)
   - You should see a success message and a table listing all 9 created tables

4. **Verify Tables Were Created**
   - Click "Table Editor" in the left sidebar
   - You should see 9 new tables:
     - projects
     - upload_sessions
     - arnold_inventory
     - supplier_catalog
     - known_interchanges
     - match_results
     - enrichment_data
     - unmatched_parts
     - line_code_mappings

5. **Test Your Application**
   - Go back to your deployed application
   - Try uploading a file
   - It should work now! ✅

## Option 2: Run Prisma Migrate Locally (5 minutes)

If you prefer to use Prisma's migration tool:

### Prerequisites:
- Node.js installed locally
- Repository cloned to your machine
- `.env.local` file configured with your Supabase credentials

### Steps:

```bash
# 1. Clone the repository (if not already done)
git clone https://github.com/thefinalwavesarehere/inventory-matching-mvp.git
cd inventory-matching-mvp

# 2. Install dependencies
npm install

# 3. Create .env.local file with your Supabase credentials
cat > .env.local << EOF
DATABASE_URL="postgresql://postgres.xxxxx:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres:[PASSWORD]@db.xxxxx.supabase.co:5432/postgres"
OPENAI_API_KEY="your-key-here"
EOF

# 4. Run Prisma migrations
npx prisma migrate deploy

# 5. Verify with Prisma Studio (optional)
npx prisma studio
```

## Verification

After running the migration, verify it worked:

### Check 1: Supabase Dashboard
- Go to Supabase → Table Editor
- You should see 9 tables listed

### Check 2: Test Upload
- Go to your deployed application
- Click "Upload Files"
- Create a new project
- Upload a test file
- Should succeed without errors

### Check 3: Check Logs
- Go to Vercel → Your Project → Logs
- Should not see "table does not exist" errors anymore

## Troubleshooting

### Error: "relation already exists"
- This means tables are already created
- Safe to ignore
- Your database is ready to use

### Error: "permission denied"
- Check your DATABASE_URL is correct
- Verify you're using the correct Supabase password
- Make sure you're using the DIRECT_URL (not pooled) for migrations

### Error: "could not connect to server"
- Check your internet connection
- Verify Supabase project is running (not paused)
- Check if your IP is allowed in Supabase settings

## What Gets Created

The migration creates:

**9 Tables**:
1. `projects` - Project grouping
2. `upload_sessions` - File upload tracking
3. `arnold_inventory` - Arnold inventory items
4. `supplier_catalog` - Supplier catalog items
5. `known_interchanges` - Known part mappings
6. `match_results` - Match results and status
7. `enrichment_data` - Additional part information
8. `unmatched_parts` - Parts requiring manual review
9. `line_code_mappings` - Line code compatibility

**Indexes** (for performance):
- 15 indexes on foreign keys and frequently queried columns

**Triggers** (for automatic updates):
- 3 triggers to automatically update `updatedAt` timestamps

## Next Steps

After migration is complete:

1. ✅ Upload your first file
2. ✅ Run the matching algorithm
3. ✅ Review and confirm matches
4. ✅ Generate reports

**Your system is now fully operational!** 🎉

## Need Help?

If you encounter any issues:

1. Check the error message in Vercel logs
2. Verify your DATABASE_URL is correct
3. Make sure Supabase project is active
4. Try running the SQL script directly in Supabase (Option 1)

For additional support, refer to:
- `DEPLOYMENT_GUIDE.md` - Complete deployment instructions
- `USER_GUIDE.md` - How to use the system
- `SUPABASE_SETUP.md` - Database configuration details
