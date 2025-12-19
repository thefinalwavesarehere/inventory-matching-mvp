# Vercel Environment Variable Setup Guide

## Critical: Database Connection Pooling Configuration

### Problem
The application crashes with `FATAL: MaxClientsInSessionMode: max clients reached` because Vercel serverless functions exhaust the Supabase connection pool.

### Solution
Configure Supabase Transaction Mode (PgBouncer) with connection limits.

---

## Required Environment Variables

### 1. DATABASE_URL (Transaction Mode - Port 6543)

**Format:**
```
postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
```

**Key Components:**
- **Protocol:** `postgresql://` (required)
- **Port:** `6543` (Transaction Mode with PgBouncer)
- **Query Parameters:** `?pgbouncer=true&connection_limit=1` (CRITICAL)

**Example:**
```
postgresql://postgres.abcdefghijklmnop:your_password_here@aws-0-us-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
```

---

### 2. DIRECT_URL (Direct Connection - Port 5432)

**Format:**
```
postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres
```

**Key Components:**
- **Protocol:** `postgresql://` (required)
- **Port:** `5432` (Direct connection for migrations)
- **No Query Parameters:** Used by Prisma for schema migrations only

**Example:**
```
postgresql://postgres.abcdefghijklmnop:your_password_here@aws-0-us-west-1.pooler.supabase.com:5432/postgres
```

---

## How to Get Your Supabase Connection String

1. Go to your Supabase project dashboard
2. Navigate to **Settings** → **Database**
3. Scroll to **Connection String** section
4. Select **Connection Pooling** (not Session)
5. Copy the connection string
6. **Modify it as follows:**
   - For `DATABASE_URL`: Change port to `6543` and add `?pgbouncer=true&connection_limit=1`
   - For `DIRECT_URL`: Change port to `5432` and remove any query parameters

---

## Setting Environment Variables in Vercel

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add both variables:
   - Name: `DATABASE_URL`
     - Value: `postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1`
     - Environment: Production, Preview, Development (check all)
   
   - Name: `DIRECT_URL`
     - Value: `postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres`
     - Environment: Production, Preview, Development (check all)

4. **Save** the variables
5. **Redeploy** your application (Settings → Deployments → Redeploy)

---

## Verification Checklist

✅ `DATABASE_URL` starts with `postgresql://`  
✅ `DATABASE_URL` uses port `6543`  
✅ `DATABASE_URL` includes `?pgbouncer=true&connection_limit=1`  
✅ `DIRECT_URL` starts with `postgresql://`  
✅ `DIRECT_URL` uses port `5432`  
✅ Both variables use the same credentials  
✅ Application has been redeployed after setting variables  

---

## Troubleshooting

### Error: "the URL must start with the protocol `postgresql://`"
- **Cause:** Environment variable is empty or missing
- **Fix:** Verify the variable name is exactly `DATABASE_URL` (case-sensitive)

### Error: "MaxClientsInSessionMode: max clients reached"
- **Cause:** Using Session Mode (port 5432) instead of Transaction Mode (port 6543)
- **Fix:** Change `DATABASE_URL` to use port `6543` with `?pgbouncer=true&connection_limit=1`

### Error: "Validation Error Count: 1"
- **Cause:** Invalid connection string format
- **Fix:** Ensure the URL follows the exact format above with no typos

---

## Why This Works

**Transaction Mode (Port 6543):**
- PgBouncer pools connections efficiently
- Each serverless function uses minimal connections
- Prevents connection exhaustion
- Required for Vercel serverless architecture

**Connection Limit = 1:**
- Each Prisma Client instance uses only 1 connection
- Prevents connection leaks
- Essential for serverless environments

**Direct URL (Port 5432):**
- Used only for Prisma migrations
- Not used during runtime
- Allows schema changes without PgBouncer interference

---

## Additional Environment Variables (Optional)

If you're using other features, you may also need:

- `NEXTAUTH_SECRET` - For authentication
- `NEXTAUTH_URL` - Your production URL
- `OPENAI_API_KEY` - For AI matching features

---

## Need Help?

If you're still experiencing issues after following this guide:

1. Check Vercel deployment logs for specific error messages
2. Verify your Supabase project is active and accessible
3. Test the connection string locally using `psql` or a database client
4. Ensure your Supabase project has connection pooling enabled

---

**Last Updated:** December 2024  
**Prisma Version:** 5.x  
**Supabase:** PgBouncer Transaction Mode  
