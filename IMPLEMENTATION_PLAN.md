# Production Readiness Implementation Plan

## Overview
This document tracks the implementation of 89 identified issues from the production readiness audit.

## Phase 1: Critical Security Fixes (COMPLETED)

### ✅ Created Files
1. `app/lib/middleware/auth.ts` - Authentication & authorization middleware
   - `requireAuth()` - Validates session and fetches user profile
   - `requireRole()` - Role-based access control
   - `requireAdmin()` - Admin-only access
   - `withAuth()`, `withRole()`, `withAdmin()` - Middleware wrappers
   - `auditLog()` - Security event logging

2. `app/lib/middleware/validation.ts` - Input validation using Zod
   - `validateBody()` - Request body validation
   - `validateQuery()` - Query parameter validation
   - `validateParams()` - Route parameter validation
   - `withValidation()` - Middleware wrapper
   - `commonSchemas` - Reusable validation schemas

3. `app/lib/middleware/rate-limit.ts` - Rate limiting protection
   - Token bucket algorithm implementation
   - Preset configurations (auth, api, readOnly, expensive, admin)
   - `withRateLimit()` - Convenience wrapper

4. `app/lib/structured-logger.ts` - Structured logging (Pino)
   - Module-specific loggers (matching, api, db, auth)
   - `PerformanceTimer` class for operation timing
   - `logRequest()`, `logMatching()`, `logError()` helpers

5. `app/api/health/route.ts` - Health check endpoint
   - Database connectivity check
   - Memory usage monitoring
   - Returns 200/503 based on system health

## Phase 2: Apply Middleware to Unprotected Routes (NEXT)

### Routes Requiring Auth Middleware (15 routes)

**Admin-only routes (require `withAdmin`):**
1. `app/api/admin/users/route.ts` - User management
2. `app/api/admin/users/[id]/route.ts` - User details
3. `app/api/admin/users/[id]/role/route.ts` - Role management
4. `app/api/admin/users/[id]/reset-password/route.ts` - Password reset

**Manager+ routes (require `withRole(['ADMIN', 'MANAGER'])`):**
5. `app/api/projects/route.ts` - Project management
6. `app/api/projects/[id]/route.ts` - Project details
7. `app/api/jobs/create/route.ts` - Job creation
8. `app/api/jobs/[id]/route.ts` - Job management

**Authenticated routes (require `withAuth`):**
9. `app/api/match/import/route.ts` - Match import
10. `app/api/match/export/route.ts` - Match export
11. `app/api/confirm/route.ts` - Match confirmation
12. `app/api/reject/route.ts` - Match rejection
13. `app/api/projects/[id]/debug-matching/route.ts` - Debug endpoint
14. `app/api/projects/[id]/debug/route.ts` - Debug endpoint
15. `app/api/user/profile/route.ts` - User profile

### Implementation Pattern

```typescript
// Before
export async function POST(request: NextRequest) {
  const body = await request.json();
  // ... logic
}

// After
import { withAdmin } from '@/app/lib/middleware/auth';
import { validateBody, commonSchemas } from '@/app/lib/middleware/validation';
import { z } from 'zod';

const schema = z.object({
  email: commonSchemas.email,
  role: z.enum(['ADMIN', 'MANAGER', 'REVIEWER', 'UPLOADER']),
});

export async function POST(request: NextRequest) {
  return withAdmin(request, async (context) => {
    const body = await validateBody(request, schema);
    // ... logic with context.user
  });
}
```

## Phase 3: Remove Legacy Code (NEXT)

### Files to Remove
1. `app/lib/auth.ts` - NextAuth configuration (replaced by Supabase)
2. `app/api/auth/[...nextauth]/route.ts` - NextAuth API routes
3. All references to `getServerSession` and `authOptions`

### Database Cleanup
1. Drop `users` table (old NextAuth table)
2. Drop `sessions` table (NextAuth sessions)
3. Drop `accounts` table (NextAuth accounts)
4. Drop `verification_tokens` table (NextAuth tokens)

## Phase 4: Add Database Indexes (NEXT)

```sql
-- Performance indexes for matching queries
CREATE INDEX CONCURRENTLY idx_store_items_project_unmatched 
  ON store_items(project_id, id) 
  WHERE match_status = 'UNMATCHED';

CREATE INDEX CONCURRENTLY idx_supplier_items_partnumber_gin 
  ON supplier_items USING gin(part_number gin_trgm_ops);

CREATE INDEX CONCURRENTLY idx_match_candidates_confidence 
  ON match_candidates(store_item_id, confidence DESC) 
  WHERE status = 'PENDING';

CREATE INDEX CONCURRENTLY idx_jobs_status_created 
  ON jobs(status, created_at DESC);
```

## Phase 5: Replace console.log (NEXT)

### Files with console.log (864 occurrences)
- All matching library files (`app/lib/matching/*.ts`)
- All API routes (`app/api/**/*.ts`)
- Job processors (`app/api/jobs/[id]/process/*.ts`)

### Replacement Pattern
```typescript
// Before
console.log(`[AI_MATCHER] Processing ${items.length} items`);

// After
import { matchingLogger } from '@/app/lib/structured-logger';
matchingLogger.info({ itemCount: items.length }, 'Processing items');
```

## Phase 6: Add Test Coverage (NEXT)

### Target: 80% Coverage

**Unit Tests (Vitest):**
- Middleware functions (auth, validation, rate-limit)
- Matching algorithms (exact, fuzzy, AI, web search)
- Utility functions

**Integration Tests:**
- API routes with authentication
- Database operations
- Matching pipeline end-to-end

**E2E Tests (Playwright):**
- User login flow
- Project creation
- File upload and matching
- Match review and confirmation

## Phase 7: Documentation (NEXT)

### Required Documentation
1. `README.md` - Project overview and setup
2. `DEPLOYMENT.md` - Production deployment guide
3. `API.md` - API endpoint documentation
4. `ARCHITECTURE.md` - System architecture overview
5. `CONTRIBUTING.md` - Development guidelines

## Phase 8: Deployment Checklist

### Environment Variables
- [ ] `DATABASE_URL` - Production database connection
- [ ] `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anon key
- [ ] `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
- [ ] `OPENAI_API_KEY` - OpenAI API key
- [ ] `TAVILY_API_KEY` - Tavily API key
- [ ] `LOG_LEVEL` - Logging level (info/debug)
- [ ] `NODE_ENV` - Environment (production)

### Infrastructure
- [ ] Database migrations applied
- [ ] RLS policies enabled
- [ ] Health check endpoint configured in load balancer
- [ ] Monitoring/alerting configured (Sentry/Datadog)
- [ ] Rate limiting configured
- [ ] Backup strategy in place

### Security
- [ ] All API routes protected with authentication
- [ ] Input validation on all endpoints
- [ ] SQL injection prevention verified
- [ ] CORS configured correctly
- [ ] Secrets rotated and secured

## Progress Tracking

- [x] Phase 1: Critical Security Fixes (5 files created)
- [ ] Phase 2: Apply Middleware (15 routes to update)
- [ ] Phase 3: Remove Legacy Code (4 tables, 3 files)
- [ ] Phase 4: Add Database Indexes (4 indexes)
- [ ] Phase 5: Replace console.log (864 occurrences)
- [ ] Phase 6: Add Test Coverage (target 80%)
- [ ] Phase 7: Documentation (5 documents)
- [ ] Phase 8: Deployment Checklist (verification)

## Estimated Timeline

| Phase | Effort | Status |
|-------|--------|--------|
| Phase 1 | 4 hours | ✅ COMPLETE |
| Phase 2 | 6 hours | 🔄 IN PROGRESS |
| Phase 3 | 2 hours | ⏳ PENDING |
| Phase 4 | 1 hour | ⏳ PENDING |
| Phase 5 | 8 hours | ⏳ PENDING |
| Phase 6 | 16 hours | ⏳ PENDING |
| Phase 7 | 8 hours | ⏳ PENDING |
| Phase 8 | 4 hours | ⏳ PENDING |
| **Total** | **49 hours** | **8% complete** |

## Next Steps

1. Update 15 API routes with authentication middleware
2. Add input validation schemas to all routes
3. Test authentication flow end-to-end
4. Remove NextAuth legacy code
5. Apply database indexes
6. Begin console.log replacement
