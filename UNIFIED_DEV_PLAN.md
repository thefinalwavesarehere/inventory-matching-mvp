# Inventory Matching System – Unified Dev Plan

## 0. Context Snapshot
- **Pipeline (current)**
  - Deterministic: canonical normalization, line-code + manufacturer part, manufacturer part only, interchange, prefix stripping, cost-based boosts.
  - Fuzzy: Levenshtein / substring blending at 0.65 threshold; up to ~1000 candidates per item.
  - AI Catalog Matching: GPT-4.1 over curated candidates with generous ~60% similarity acceptance.
  - AI Web-Search Matching: Similar AI prompt; currently catalog-only in practice and under-utilizes web search.
- **Stack**: Vercel, Prisma + Postgres, OpenAI GPT-4.1 + OpenAI Agents SDK.
- **Primary code**: `app/lib/matching-engine.ts`, `app/api/match/ai/route.ts`, `app/api/match/web-search/route.ts`, `app/api/jobs/[id]/processors.ts`.
- **Global goals**: increase precision, maintain/improve recall, improve explainability/telemetry, and manage latency/token cost.

## 1. Guiding Principles
- Ship behind feature flags and environment-driven toggles to enable safe rollout and A/B comparisons.
- Centralize thresholds and weights so experimentation is configuration-driven rather than code-driven.
- Instrument every stage for volume, quality, and cost so regressions and wins are obvious.
- Maintain a small, repeatable regression harness to validate changes before deploy.
- Enforce structured outputs for AI stages with schema validation and retries.

## 2. Cross-Cutting Engineering Workstreams

### 2.1 Feature Flags & Modes
- **Deliverable**: Environment-driven toggles enabling `deterministic-only`, `deterministic+fuzzy`, and `full AI` modes, plus per-stage on/off switches.
- **Implementation notes**:
  - Use Vercel env vars or a lightweight flag helper (e.g., boolean gate helper in `app/lib/config`); avoid external dependencies unless already approved.
  - Flags should be readable in server and edge contexts without client exposure.
  - Include safe defaults (e.g., deterministic-only in production until confidence grows).

### 2.2 Telemetry & Metrics
- **Deliverable**: Structured logging and counters per request/job for:
  - Match counts per stage and per-rule hit counts (Stage 1).
  - Thresholds applied and acceptance decisions (include score values and deltas).
  - Latency + token usage per AI call (catalog + web-search) with sampling if needed.
  - Pipeline-level match rate by stage and false-positive queue volume (hook into human feedback mechanism when available).
- **Implementation notes**:
  - Add lightweight logger wrapper that accepts a `traceId/jobId` and stage metadata.
  - Emit metrics in a serializable format (JSON) to ease future aggregation/ELK/Datadog ingestion.
  - Guard sensitive payloads; log references/IDs instead of full prompts when necessary.

### 2.3 Regression Harness (Golden Dataset)
- **Deliverable**: Repeatable test harness that runs the full pipeline against 50–200 curated SKUs with expected matches.
- **Implementation notes**:
  - Store fixtures in `scripts/fixtures/golden-matches.json` (or similar) with clear schema: input SKU, expected match IDs, allowed alternates.
  - Provide a script (e.g., `pnpm run match:golden`) that executes the pipeline in a deterministic mode and reports diffs vs. expected.
  - Wire into CI to surface algorithm diffs in PRs; fail builds on precision/recall regression thresholds agreed with PM.

### 2.4 Config-Driven Thresholds & Weights
- **Deliverable**: Central config module exposing thresholds and weights per stage (and optional per-category/line-code overrides).
- **Implementation notes**:
  - Define a typed config object (e.g., `app/lib/matching-config.ts`) loaded from env/default JSON.
  - Include fuzzy similarity thresholds, AI confidence cutoffs, cost delta boosts, and max candidate counts.
  - Add helper to fetch per-category overrides with sensible fallbacks.
  - Ensure config values are logged alongside decisions for auditability.

### 2.5 AI Output Schema Validation
- **Deliverable**: JSON schema for AI Catalog (Stage 3) and AI Web-Search (Stage 4) responses with validation + retry.
- **Implementation notes**:
  - Define schemas in a shared location (e.g., `app/lib/ai-schemas.ts`) and validate parsed JSON before use.
  - On validation failure: log the error, optionally adjust prompt formatting, and retry with a capped attempt count; otherwise mark the candidate set as unusable.
  - Keep schemas minimal but strict enough to prevent malformed matches entering downstream stages.

## 3. PM / Product Inputs Needed
- Clarify priority trade-off for this phase: bias for higher precision vs. higher recall.
- Agree on minimum acceptable match rates by stage (deterministic, fuzzy, AI catalog, AI web-search).
- Approve and supply the golden dataset (50–200 items) with known correct matches and edge cases.
- Define thresholds for false-positive review queue triggers.

## 4. Execution Roadmap (Order of Operations)
1. **Establish config + flags**: add central config and stage toggles; deploy with deterministic-only default in prod.
2. **Telemetry baseline**: instrument all stages to capture counts, thresholds, latency, and token usage; deploy logging-only change.
3. **Golden harness**: land fixtures + CLI/CI runner; start capturing baseline metrics from current pipeline.
4. **Schema validation**: implement AI response schemas with retries; monitor failure rates.
5. **Threshold tuning**: iterate using flags + harness; adjust per-category overrides where available.
6. **Web-search expansion**: once telemetry and schema controls are stable, unlock web-search stage and evaluate impact via harness and logs.

## 5. Acceptance Criteria
- All stages can be toggled via env/flags without code changes.
- Metrics emitted for every stage include counts, thresholds, latency, and token usage; logs are structured and correlate by job/request.
- Golden dataset harness runs in CI and fails builds on agreed regression thresholds.
- Thresholds and weights are centralized and adjustable per environment.
- AI stages enforce JSON schema validation with retry logic, preventing malformed outputs from propagating.

## 6. Cost & Risk Controls
- Use per-stage sampling for verbose telemetry to cap log volume.
- Cap AI candidate counts and retries; log token usage to track spend.
- Keep deterministic path intact as a safe fallback and enable quick rollback via feature flags.

## 7. Notes for Deployment
- Stagger rollout: enable instrumentation first, then flags/config, then AI schema validation, then web-search expansion.
- Maintain a short-lived “shadow” run of fuzzy/AI stages in production to gather telemetry without affecting outcomes until thresholds are tuned.
- Document flag defaults and environment variable names in `README`/`QUICKSTART` once finalized.
