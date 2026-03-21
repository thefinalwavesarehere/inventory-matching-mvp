# Senior Architecture Audit Report: Inventory Matching MVP

**Date:** March 21, 2026
**Target:** `thefinalwavesarehere/inventory-matching-mvp`
**Commit:** `9fbbf1b` (HEAD)

---

## 1. Executive Summary

The `inventory-matching-mvp` is a Next.js 13 (App Router) application acting as an orchestrator for a complex data pipeline. It leverages Prisma (PostgreSQL + pgvector), Upstash (Redis + QStash), and OpenAI for semantic part matching. 

While the architecture demonstrates a solid foundation for a multi-stage data processing pipeline (deterministic $\rightarrow$ fuzzy $\rightarrow$ vector $\rightarrow$ AI), the codebase currently exhibits significant technical debt, security vulnerabilities (specifically around tenant isolation and unprotected endpoints), and performance bottlenecks that will hinder scaling. 

The most critical issues involve missing project-level authorization checks (tenant isolation failure), unprotected administrative API routes, unbounded database queries (`findMany` without `take`), and proliferation of dead/backup files in the core processing pipeline.

---

## 2. Architecture Overview

The system is built on a modern serverless stack, though it stretches the limits of Vercel's serverless functions due to the long-running nature of its tasks.

| Component | Technology | Role |
| :--- | :--- | :--- |
| **Framework** | Next.js 13.4.12 (App Router) | Full-stack framework, API routes, UI |
| **Database** | PostgreSQL + pgvector (via Prisma 6.18) | Relational storage, vector similarity search |
| **Caching/State** | Upstash Redis | L2 Supplier Catalog caching |
| **Queue/Jobs** | Upstash QStash | Asynchronous job dispatch (circumventing Vercel timeouts) |
| **AI/ML** | OpenAI (`text-embedding-3-small`, `gpt-4.1-mini`) | Embeddings generation, LLM matching |
| **Auth** | Supabase Auth | JWT-based authentication |

### The Matching Pipeline

The core value proposition is the matching engine, which is well-architected into a waterfall pattern to optimize cost and speed:

1. **Stage 0:** Master Rules (Self-learning system based on past human reviews)
2. **Stage 1:** Deterministic / Exact Matching (Strict, Normalized, Brand Alias)
3. **Stage 2:** Vector Similarity Matching (`pgvector` cosine similarity)
4. **Stage 3:** AI Matching (Batched LLM calls)
5. **Stage 4:** Web Search Fallback (Tavily)

---

## 3. Critical Findings & Risks

### 3.1 Security & Authorization (High Priority)

**Tenant Isolation Failure:**
Several API routes fail to validate that the requested resource belongs to the authenticated user's organization/tenant. For example, `GET /api/projects/[id]` and `DELETE /api/projects/[id]` only verify that *a* user is authenticated, but do not check if `projectId` belongs to `context.user`. This is a critical Insecure Direct Object Reference (IDOR) vulnerability.

**Unprotected API Routes:**
The Next.js `middleware.ts` explicitly bypasses authentication for `/api/jobs` and `/api/progress`. 
```typescript
const publicApiRoutes = ['/api/auth/create-profile', '/api/auth/callback', '/api/cron', '/api/jobs', '/api/progress'];
```
While `/api/cron` verifies a `CRON_SECRET`, the `/api/jobs` and `/api/progress` routes are entirely public, potentially leaking project metadata and matching progress to unauthenticated actors. Furthermore, administrative routes like `/api/admin/setup-status` and `/api/analytics/summary` are missing the `withAuth` or `withAdmin` wrappers entirely.

**Role Enum Mismatch:**
The `withEditor` middleware checks for the `'EDITOR'` role:
```typescript
export async function requireEditor(): Promise<AuthContext> {
  return requireRole(['ADMIN', 'EDITOR']);
}
```
However, the Prisma schema does not define `'EDITOR'` in the `Role` enum (`ADMIN`, `MANAGER`, `REVIEWER`, `UPLOADER`). This will cause runtime authorization failures or type errors.

### 3.2 Performance & Scalability (Medium Priority)

**Unbounded Queries (N+1 and Memory Exhaustion):**
There are 66 instances of `prisma.*.findMany()` without a `take` (limit) clause. The most critical is in `/api/projects/[id]/matches/bulk/route.ts`, which attempts to load all match candidates into memory at once. For large inventory files (100k+ rows), this will cause Vercel function OOM (Out of Memory) crashes.

**N+1 Query Patterns in Matching Engine:**
In `app/lib/matching/master-rules-matcher.ts`, there are nested loops executing database queries sequentially:
```typescript
for (const rule of positiveRules) {
  for (const storeItem of storeItems) {
    for (const supplierItem of supplierItems) {
      // ... DB operations ...
    }
  }
}
```
This pattern will exponentially degrade performance as the number of rules and items grows.

**File Upload Limitations:**
The `/api/upload/route.ts` uses the `xlsx` package to parse Excel files into memory buffers. `XLSX.read(buffer)` is synchronous and highly memory-intensive. Uploading a 50MB Excel file will likely crash the 1024MB Vercel serverless function. There is also insufficient file size and MIME-type validation before the buffer is read into memory.

### 3.3 Code Quality & Tech Debt (Medium Priority)

**Processor Proliferation:**
The core job processing directory (`app/api/jobs/[id]/`) contains multiple dead/backup files:
* `processors.ts` (583 lines)
* `processors-improved.ts` (393 lines)
* `processors-v9.1.ts` (234 lines)
* `processors-v9.0-backup.ts`
* `processors_backup.ts`
This indicates a lack of confidence in version control and creates massive confusion regarding which matching logic is actually running in production.

**Rate Limiting Implementation:**
The rate limiter (`app/lib/middleware/rate-limit.ts`) uses an in-memory `Map()`. In a serverless environment like Vercel, memory is not shared across function invocations or regions. This means the rate limiter is effectively useless for distributed traffic, as each function instance gets its own isolated `Map`.

---

## 4. Actionable Recommendations

### Phase 1: Immediate Security Fixes (Next 48 Hours)

1. **Enforce Tenant Isolation:** Update all `/api/projects/[id]/*` routes to verify `projectId` ownership against `context.user.id` or the user's organization ID.
2. **Secure Public Routes:** Remove `/api/jobs` and `/api/progress` from `publicApiRoutes` in `middleware.ts`. Ensure they are protected by `withAuth`.
3. **Protect Admin Routes:** Add the `withAdmin` wrapper to all routes in `/api/admin/*` and `/api/analytics/*`.
4. **Fix Role Enum:** Align the `Role` enum in `schema.prisma` with the roles checked in `auth.ts` (add `EDITOR` or change the middleware to use `MANAGER`/`UPLOADER`).

### Phase 2: Stability & Performance (Next 1-2 Weeks)

1. **Implement Pagination:** Audit all 66 unbounded `findMany` calls. Add `take` and `skip` (or cursor-based pagination) to endpoints like the bulk match reviewer.
2. **Refactor Rate Limiting:** Replace the in-memory `Map()` in `rate-limit.ts` with Upstash Redis, which is already configured in the project (`app/lib/redis.ts`).
3. **Optimize Master Rules:** Refactor the nested loops in `master-rules-matcher.ts` to use bulk `INSERT` / `UPDATE` operations (`prisma.matchCandidate.createMany`) and `IN` clauses to avoid N+1 database calls.
4. **Stream Large Uploads:** Replace synchronous `xlsx` parsing with a streaming parser (like `csv-parser` for CSVs, or stream Excel parsing) to prevent OOM errors on large files.

### Phase 3: Codebase Cleanup (Next 1 Month)

1. **Consolidate Processors:** Audit the various `processors-*.ts` files. Determine the active version, delete the rest, and rely on Git for version history.
2. **Centralize Configuration:** Move hardcoded values (like AI batch sizes, confidence thresholds) into a centralized configuration file or environment variables.
3. **Upgrade Next.js:** The project is on Next.js `13.4.12`. Plan an upgrade to Next.js `14.x` or `15.x` to benefit from improved App Router stability, memory management, and caching semantics.
