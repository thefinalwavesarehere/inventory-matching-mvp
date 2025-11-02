# Supabase Setup Instructions

This document provides step-by-step instructions for setting up Supabase for the Inventory Matching System.

## Prerequisites

- A Supabase account (sign up at https://supabase.com)
- Node.js and npm installed locally

## Step 1: Create a New Supabase Project

1. Go to https://app.supabase.com
2. Click "New Project"
3. Fill in the project details:
   - **Name**: `inventory-matching-mvp` (or your preferred name)
   - **Database Password**: Choose a strong password (save this!)
   - **Region**: Choose the region closest to your users
   - **Pricing Plan**: Free tier is sufficient for MVP
4. Click "Create new project"
5. Wait for the project to be provisioned (takes 1-2 minutes)

## Step 2: Get Your Database Connection Strings

1. In your Supabase project dashboard, click on "Project Settings" (gear icon in the left sidebar)
2. Navigate to "Database" section
3. Scroll down to "Connection string" section
4. You'll need TWO connection strings:

### Connection Pooling URL (for Prisma with serverless)
- Select "URI" tab
- Copy the connection string that looks like:
  ```
  postgresql://postgres.xxxxx:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
  ```
- This will be your `DATABASE_URL`

### Direct Connection URL (for migrations)
- Select "URI" tab under "Direct connection"
- Copy the connection string that looks like:
  ```
  postgresql://postgres:[YOUR-PASSWORD]@db.xxxxx.supabase.co:5432/postgres
  ```
- This will be your `DIRECT_URL`

## Step 3: Update Environment Variables

1. Open `.env.local` in your project root
2. Replace the placeholders with your actual connection strings:

```env
DATABASE_URL="postgresql://postgres.xxxxx:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres:[YOUR-PASSWORD]@db.xxxxx.supabase.co:5432/postgres"
```

**Important**: Replace `[YOUR-PASSWORD]` with the actual database password you created in Step 1.

## Step 4: Run Database Migrations

Once you have updated the environment variables, run the following commands to create the database schema:

```bash
# Generate Prisma Client
npx prisma generate

# Create and apply the initial migration
npx prisma migrate dev --name init

# (Optional) Open Prisma Studio to view your database
npx prisma studio
```

## Step 5: Verify the Setup

After running migrations, verify that all tables were created:

1. Go to your Supabase dashboard
2. Click on "Table Editor" in the left sidebar
3. You should see the following tables:
   - `projects`
   - `upload_sessions`
   - `arnold_inventory`
   - `supplier_catalog`
   - `known_interchanges`
   - `match_results`
   - `enrichment_data`
   - `unmatched_parts`
   - `line_code_mappings`

## Step 6: (Optional) Seed Known Interchanges

If you want to pre-populate the known interchanges from the Interchange.xlsx file, you can create a seed script:

```bash
# Create a seed script
npx prisma db seed
```

## Step 7: Deploy to Vercel

When deploying to Vercel:

1. Go to your Vercel project settings
2. Navigate to "Environment Variables"
3. Add the following variables:
   - `DATABASE_URL`: Your connection pooling URL
   - `DIRECT_URL`: Your direct connection URL
   - `NODE_ENV`: `production`
4. Redeploy your application

## Troubleshooting

### Connection Issues

If you encounter connection issues:

1. **Check your password**: Make sure you're using the correct database password
2. **Check IP allowlist**: Supabase allows all IPs by default, but verify in Settings > Database > Connection pooling
3. **SSL Mode**: Ensure your connection string includes `?sslmode=require` if needed

### Migration Issues

If migrations fail:

1. **Reset the database** (WARNING: This deletes all data):
   ```bash
   npx prisma migrate reset
   ```

2. **Push schema without migration** (for development):
   ```bash
   npx prisma db push
   ```

### Prisma Client Issues

If you get "Prisma Client not found" errors:

```bash
npx prisma generate
```

## Additional Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Prisma with Supabase Guide](https://supabase.com/docs/guides/integrations/prisma)

## Security Best Practices

1. **Never commit `.env.local`** to version control
2. **Use environment variables** in Vercel for production
3. **Rotate database passwords** periodically
4. **Enable Row Level Security (RLS)** in Supabase for production (optional for MVP)
5. **Monitor database usage** in Supabase dashboard

## Next Steps

After completing the Supabase setup:

1. Test the file upload functionality
2. Verify data is being saved to the database
3. Test the matching algorithm
4. Review match results in Prisma Studio or Supabase Table Editor
