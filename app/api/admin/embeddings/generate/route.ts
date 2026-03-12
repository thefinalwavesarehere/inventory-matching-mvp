/**
 * Admin: Generate embeddings for a project
 * POST /api/admin/embeddings/generate
 *
 * Body: { projectId: string, type: "store" | "supplier" | "both" }
 *
 * Runs embedding generation as a streaming response so the client can
 * monitor progress. Long-running — may take several minutes for large catalogs.
 */
import { NextRequest, NextResponse } from 'next/server';
import { withAdmin } from '@/app/lib/middleware/auth';
import { apiLogger } from '@/app/lib/structured-logger';
import { generateStoreEmbeddings, generateSupplierEmbeddings } from '@/app/lib/matching/embedding-generator';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  return withAdmin(req, async (context) => {
    try {
      const { projectId, type = 'both' } = await req.json();

      if (!projectId) {
        return NextResponse.json({ error: 'projectId required' }, { status: 400 });
      }

      apiLogger.info(`[EMBEDDINGS] Starting generation for project=${projectId} type=${type}`);

      const results: Record<string, { generated: number; skipped: number }> = {};

      if (type === 'store' || type === 'both') {
        results.store = await generateStoreEmbeddings(projectId, (done, total) => {
          apiLogger.info(`[EMBEDDINGS] Store: ${done}/${total}`);
        });
      }

      if (type === 'supplier' || type === 'both') {
        results.supplier = await generateSupplierEmbeddings(projectId, (done, total) => {
          apiLogger.info(`[EMBEDDINGS] Supplier: ${done}/${total}`);
        });
      }

      apiLogger.info(`[EMBEDDINGS] Complete for project=${projectId}`, results);

      return NextResponse.json({ success: true, projectId, results });
    } catch (error: any) {
      apiLogger.error('[EMBEDDINGS] Generation failed:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  });
}
