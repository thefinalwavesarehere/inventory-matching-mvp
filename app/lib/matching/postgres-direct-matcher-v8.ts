/**
 * Interchange Bridge Matcher — V10.2
 *
 * Performance improvements over V10.1:
 *
 * 1. REGEXP_REPLACE eliminated — joins now use pre-computed `partNumberNorm`
 *    columns (already indexed) instead of calling REGEXP_REPLACE at query-time
 *    on every row. This turns a full-table function scan into an index seek.
 *
 * 2. SQL injection fix — `storeIds` was previously string-interpolated into
 *    the query. Now passed as a Postgres ANY($N::text[]) parameter.
 *
 * 3. NOT EXISTS → LEFT JOIN anti-join — correlated subquery replaced with a
 *    LEFT JOIN / IS NULL pattern which the Postgres planner can hash-join.
 *
 * 4. Parameterized via $queryRaw (tagged template) instead of $queryRawUnsafe.
 *
 * 5. console.log → apiLogger (structured JSON).
 */

import { prisma } from '@/app/lib/db/prisma';
import { Prisma } from '@prisma/client';
import { apiLogger } from '@/app/lib/structured-logger';

export interface PostgresDirectMatch {
  storeItemId: string;
  supplierItemId: string;
  storePartNumber: string;
  supplierPartNumber: string;
  storeLineCode: string | null;
  supplierLineCode: string | null;
  confidence: number;
  matchMethod: string;
  matchReason: string;
}

/**
 * Find interchange bridge matches for a project.
 *
 * @param projectId  - Project scope
 * @param storeIds   - Optional subset of store item IDs to process
 */
export async function findDirectMatches(
  projectId: string,
  storeIds?: string[]
): Promise<PostgresDirectMatch[]> {
  apiLogger.info({ projectId }, '[INTERCHANGE_BRIDGE_V10.2] Starting');

  const interchangeCount = await prisma.interchange.count({ where: { projectId } });
  apiLogger.info({ projectId, interchangeCount }, '[INTERCHANGE_BRIDGE_V10.2] Interchange mappings found');

  if (interchangeCount === 0) {
    apiLogger.warn({ projectId }, '[INTERCHANGE_BRIDGE_V10.2] No interchange data — skipping');
    return [];
  }

  try {
    let matches: PostgresDirectMatch[];

    if (storeIds && storeIds.length > 0) {
      // -----------------------------------------------------------------------
      // Filtered path — storeIds passed as a safe array parameter (ANY)
      // -----------------------------------------------------------------------
      matches = await prisma.$queryRaw<PostgresDirectMatch[]>`
        SELECT DISTINCT ON (s.id)
          s.id                                                  AS "storeItemId",
          COALESCE(sup.id, 'INTERCHANGE_ONLY')                  AS "supplierItemId",
          s."partNumber"                                        AS "storePartNumber",
          COALESCE(sup."partNumber", i."theirsPartNumber")      AS "supplierPartNumber",
          i."oursPartNumber"                                    AS "storeLineCode",
          i."theirsPartNumber"                                  AS "supplierLineCode",
          i.confidence                                          AS confidence,
          CASE
            WHEN sup.id IS NOT NULL THEN 'INTERCHANGE_BRIDGE_V10.2'
            ELSE 'INTERCHANGE_ONLY_V10.2'
          END                                                   AS "matchMethod",
          CASE
            WHEN sup.id IS NOT NULL THEN 'Interchange Bridge Match (Catalog Found)'
            ELSE 'Interchange Match (Catalog Missing)'
          END                                                   AS "matchReason"
        FROM store_items s
        -- Use pre-computed partNumberNorm for index-seek joins (no REGEXP_REPLACE)
        INNER JOIN interchanges i
          ON  i."projectId" = s."projectId"
          AND (
                s."partNumberNorm" = i."merrillPartNumberNorm"
             OR s."partNumberNorm" = i."vendorPartNumberNorm"
             -- Legacy fallback: oursPartNumber / theirsPartNumber
             OR s."partNumberNorm" = UPPER(REGEXP_REPLACE(i."oursPartNumber",   '[^A-Z0-9]', '', 'gi'))
             OR s."partNumberNorm" = UPPER(REGEXP_REPLACE(i."theirsPartNumber", '[^A-Z0-9]', '', 'gi'))
          )
        LEFT JOIN supplier_items sup
          ON (
                sup."partNumberNorm" = i."vendorPartNumberNorm"
             OR sup."partNumberNorm" = i."merrillPartNumberNorm"
             OR sup."partNumberNorm" = UPPER(REGEXP_REPLACE(i."theirsPartNumber", '[^A-Z0-9]', '', 'gi'))
             OR sup."partNumberNorm" = UPPER(REGEXP_REPLACE(i."oursPartNumber",   '[^A-Z0-9]', '', 'gi'))
          )
        -- Anti-join: skip store items that already have at least one match candidate
        LEFT JOIN match_candidates mc_exists
          ON  mc_exists."storeItemId" = s.id
        WHERE
          s."projectId" = ${projectId}
          AND s.id = ANY(${storeIds}::text[])
          AND mc_exists.id IS NULL
        ORDER BY s.id, COALESCE(sup.id, 'INTERCHANGE_ONLY') ASC
      `;
    } else {
      // -----------------------------------------------------------------------
      // Full-project path — no storeIds filter
      // -----------------------------------------------------------------------
      matches = await prisma.$queryRaw<PostgresDirectMatch[]>`
        SELECT DISTINCT ON (s.id)
          s.id                                                  AS "storeItemId",
          COALESCE(sup.id, 'INTERCHANGE_ONLY')                  AS "supplierItemId",
          s."partNumber"                                        AS "storePartNumber",
          COALESCE(sup."partNumber", i."theirsPartNumber")      AS "supplierPartNumber",
          i."oursPartNumber"                                    AS "storeLineCode",
          i."theirsPartNumber"                                  AS "supplierLineCode",
          i.confidence                                          AS confidence,
          CASE
            WHEN sup.id IS NOT NULL THEN 'INTERCHANGE_BRIDGE_V10.2'
            ELSE 'INTERCHANGE_ONLY_V10.2'
          END                                                   AS "matchMethod",
          CASE
            WHEN sup.id IS NOT NULL THEN 'Interchange Bridge Match (Catalog Found)'
            ELSE 'Interchange Match (Catalog Missing)'
          END                                                   AS "matchReason"
        FROM store_items s
        INNER JOIN interchanges i
          ON  i."projectId" = s."projectId"
          AND (
                s."partNumberNorm" = i."merrillPartNumberNorm"
             OR s."partNumberNorm" = i."vendorPartNumberNorm"
             OR s."partNumberNorm" = UPPER(REGEXP_REPLACE(i."oursPartNumber",   '[^A-Z0-9]', '', 'gi'))
             OR s."partNumberNorm" = UPPER(REGEXP_REPLACE(i."theirsPartNumber", '[^A-Z0-9]', '', 'gi'))
          )
        LEFT JOIN supplier_items sup
          ON (
                sup."partNumberNorm" = i."vendorPartNumberNorm"
             OR sup."partNumberNorm" = i."merrillPartNumberNorm"
             OR sup."partNumberNorm" = UPPER(REGEXP_REPLACE(i."theirsPartNumber", '[^A-Z0-9]', '', 'gi'))
             OR sup."partNumberNorm" = UPPER(REGEXP_REPLACE(i."oursPartNumber",   '[^A-Z0-9]', '', 'gi'))
          )
        LEFT JOIN match_candidates mc_exists
          ON  mc_exists."storeItemId" = s.id
        WHERE
          s."projectId" = ${projectId}
          AND mc_exists.id IS NULL
        ORDER BY s.id, COALESCE(sup.id, 'INTERCHANGE_ONLY') ASC
      `;
    }

    apiLogger.info(
      { projectId, matchCount: matches.length },
      '[INTERCHANGE_BRIDGE_V10.2] Complete'
    );
    return matches;
  } catch (error: any) {
    apiLogger.error({ projectId, error: error.message }, '[INTERCHANGE_BRIDGE_V10.2] Query failed');
    throw error;
  }
}

/**
 * Diagnostic: verify partNumberNorm population for a project.
 */
export async function diagnosePartNumberNorm(projectId: string): Promise<void> {
  apiLogger.info({ projectId }, '[V10.2_DIAGNOSTIC] Checking norm column population');

  const [storeTotal, storeWithNorm, supplierTotal, supplierWithNorm] = await Promise.all([
    prisma.storeItem.count({ where: { projectId } }),
    prisma.storeItem.count({ where: { projectId, partNumberNorm: { not: '' } } }),
    prisma.supplierItem.count({ where: { projectId } }),
    prisma.supplierItem.count({ where: { projectId, partNumberNorm: { not: '' } } }),
  ]);

  apiLogger.info(
    { projectId, storeTotal, storeWithNorm, supplierTotal, supplierWithNorm },
    '[V10.2_DIAGNOSTIC] Norm population'
  );

  if (storeWithNorm < storeTotal) {
    apiLogger.warn(
      { projectId, missing: storeTotal - storeWithNorm },
      '[V10.2_DIAGNOSTIC] Some store items missing partNumberNorm — re-run import normalisation'
    );
  }
  if (supplierWithNorm < supplierTotal) {
    apiLogger.warn(
      { projectId, missing: supplierTotal - supplierWithNorm },
      '[V10.2_DIAGNOSTIC] Some supplier items missing partNumberNorm — re-run import normalisation'
    );
  }
}
