/**
 * Background Job Processors
 * Improved AI and Web Search matching logic for background jobs
 */

import OpenAI from 'openai';
import prisma from '@/app/lib/db/prisma';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Process AI matching for a chunk of items
 * Uses improved prompt with examples and better candidate selection
 */
export async function processAIMatching(
  storeItems: any[],
  supplierItems: any[],
  projectId: string
): Promise<number> {
  let matchCount = 0;

  // Process in batches of 10 for API rate limiting
  for (let i = 0; i < storeItems.length; i += 10) {
    const batch = storeItems.slice(i, i + 10);

    for (const storeItem of batch) {
      try {
        // Get relevant candidates (top 50)
        const candidates = getCandidates(storeItem, supplierItems, 50);

        if (candidates.length === 0) continue;

        const prompt = `You are an automotive parts expert. Find the BEST match for this store part from the supplier catalog.

MATCHING EXAMPLES:
✓ MATCH: "ABC10026A" matches "DLPEG10026" (different line code, same core)
✓ MATCH: "ABC-123" matches "ABC123" (punctuation removed)
✓ MATCH: "LTG-G6002" matches "LTGG6002" (punctuation removed)
✓ MATCH: "ABH8865" matches "BAT08865" (different line code, similar core)
✗ NO MATCH: "ABC12345" vs "ABC54321" (different core numbers)

Store Part to Match:
- Part: ${storeItem.partNumber}
- Desc: ${storeItem.description || 'N/A'}
- Line: ${storeItem.lineCode || 'N/A'}
- Mfr: ${storeItem.mfrPartNumber || 'N/A'}

Supplier Catalog (${candidates.length} most relevant items):
${candidates.map((s, idx) => `${idx + 1}. ${s.partNumber}${s.description ? ` - ${s.description}` : ''}`).join('\\n')}

MATCHING RULES:
1. **Punctuation doesn't matter**: ABC-123 = ABC.123 = ABC 123 = ABC123
2. **Line codes can differ**: Focus on core numbers/letters
3. **60%+ similarity is acceptable**: Minor differences are OK
4. **When in doubt, MATCH IT** - be generous

Respond with ONLY valid JSON:
{
  "match": true/false,
  "supplierPartNumber": "EXACT_PART_NUMBER" or null,
  "confidence": 0.6-1.0,
  "reason": "Brief reason"
}`;

        const response = await openai.chat.completions.create({
          model: 'gpt-4.1-mini',
          messages: [
            {
              role: 'system',
              content: 'You are an expert automotive parts matcher. Be generous - 60%+ similarity is acceptable. Always respond with valid JSON only.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.3,
          max_tokens: 250,
        });

        let responseText = response.choices[0]?.message?.content?.trim();
        if (!responseText) continue;

        // Remove markdown code blocks
        responseText = responseText
          .replace(/^```json/gm, '')
          .replace(/^```/gm, '')
          .replace(/`/g, '')
          .trim();

        const aiResponse = JSON.parse(responseText);

        if (aiResponse.match && aiResponse.supplierPartNumber) {
          const supplier = supplierItems.find(
            (s) => s.partNumber === aiResponse.supplierPartNumber
          );

          if (supplier) {
            await prisma.matchCandidate.create({
              data: {
                projectId,
                storeItemId: storeItem.id,
                targetType: 'SUPPLIER',
                targetId: supplier.id,
                method: 'AI',
                confidence: aiResponse.confidence || 0.8,
                matchStage: 3,
                status: 'PENDING',
                features: {
                  aiReason: aiResponse.reason,
                  model: 'gpt-4.1-mini',
                  candidatesShown: candidates.length,
                },
              },
            });

            matchCount++;
            console.log(`[AI-JOB] Match: ${storeItem.partNumber} -> ${supplier.partNumber} (${aiResponse.confidence})`);
          }
        }
      } catch (error) {
        console.error(`[AI-JOB] Error processing ${storeItem.partNumber}:`, error);
      }
    }
  }

  return matchCount;
}

/**
 * Process web search matching for a chunk of items
 * Uses improved OpenAI-based catalog search
 */
export async function processWebSearchMatching(
  storeItems: any[],
  supplierItems: any[],
  projectId: string
): Promise<number> {
  let matchCount = 0;

  for (const storeItem of storeItems) {
    try {
      // Get relevant candidates
      const candidates = getCandidates(storeItem, supplierItems, 30);

      const catalogContext = candidates.length > 0
        ? `\\n\\nOur Supplier Catalog (${candidates.length} similar items for reference):\\n${candidates.map((s, idx) => `${idx + 1}. ${s.partNumber}${s.description ? ` - ${s.description}` : ''}`).slice(0, 20).join('\\n')}`
        : '';

      const prompt = `You are an automotive parts expert. Find the BEST match for this store part from our supplier catalog.

MATCHING EXAMPLES:
✓ MATCH: "AELAC488" matches "AC488" (line code stripped)
✓ MATCH: "ABC-123" matches "ABC123" (punctuation removed)
✓ MATCH: "LTG-G6002" matches "LTGG6002" (punctuation removed)
✓ MATCH: "ABH8865" matches "BAT08865" (different line code, same core)
✗ NO MATCH: "ABC12345" vs "ABC54321" (different core numbers)

Store Part to Match:
- Part: ${storeItem.partNumber}
- Desc: ${storeItem.description || 'N/A'}
- Line: ${storeItem.lineCode || 'N/A'}
- Mfr: ${storeItem.mfrPartNumber || 'N/A'}${catalogContext}

MATCHING RULES:
1. **Check supplier catalog ONLY** - do not search the web
2. **Punctuation doesn't matter**: ABC-123 = ABC.123 = ABC 123 = ABC123
3. **Line codes can differ**: AELAC488 = AC488 (focus on core numbers)
4. **60%+ similarity is acceptable**: Minor differences are OK
5. **When in doubt, MATCH IT** - be generous

Respond with ONLY valid JSON:
{
  "match": true/false,
  "supplierPartNumber": "EXACT_PART_NUMBER" or null,
  "confidence": 0.6-1.0,
  "reason": "Brief reason"
}`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4.1-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert automotive parts matcher. Match parts from the supplier catalog only. Be generous - 60%+ similarity is acceptable. Always respond with valid JSON only.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 250,
      });

      let responseText = response.choices[0]?.message?.content?.trim();
      if (!responseText) continue;

      // Remove markdown code blocks
      responseText = responseText
        .replace(/^```json/gm, '')
        .replace(/^```/gm, '')
        .replace(/`/g, '')
        .trim();

      const webResponse = JSON.parse(responseText);

      if (webResponse.match && webResponse.supplierPartNumber) {
        // Find or create supplier item
        let supplier = supplierItems.find(
          (s) => s.partNumber === webResponse.supplierPartNumber
        );

        if (!supplier) {
          // Create new supplier item for web-found match
          supplier = await prisma.supplierItem.create({
            data: {
              projectId,
              supplier: 'Web Search Result',
              partNumber: webResponse.supplierPartNumber,
              partFull: webResponse.supplierPartNumber,
              partNumberNorm: webResponse.supplierPartNumber.replace(/[^A-Z0-9]/gi, '').toUpperCase(),
              description: null,
              currentCost: null,
            },
          });
        }

        await prisma.matchCandidate.create({
          data: {
            projectId,
            storeItemId: storeItem.id,
            targetType: 'SUPPLIER',
            targetId: supplier.id,
            method: 'WEB_SEARCH',
            confidence: webResponse.confidence || 0.85,
            matchStage: 4,
            status: 'PENDING',
            features: {
              searchReason: webResponse.reason,
              model: 'gpt-4.1-mini',
            },
          },
        });

        matchCount++;
        console.log(`[WEB-SEARCH-JOB] Match: ${storeItem.partNumber} -> ${supplier.partNumber} (${webResponse.confidence})`);
      }
    } catch (error) {
      console.error(`[WEB-SEARCH-JOB] Error processing ${storeItem.partNumber}:`, error);
    }
  }

  return matchCount;
}

/**
 * Get relevant candidates for a store item
 */
function getCandidates(storeItem: any, supplierItems: any[], maxCandidates: number): any[] {
  let candidates: any[] = [];

  // Strategy 1: Same line code (highest priority)
  if (storeItem.lineCode) {
    candidates = supplierItems.filter((s) => s.lineCode === storeItem.lineCode);
  }

  // Strategy 2: Similar manufacturer part numbers
  if (candidates.length < maxCandidates * 0.6 && storeItem.mfrPartNumber) {
    const storeMfr = storeItem.mfrPartNumber.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    const mfrMatches = supplierItems.filter((s) => {
      if (!s.mfrPartNumber) return false;
      const supplierMfr = s.mfrPartNumber.replace(/[^A-Z0-9]/gi, '').toUpperCase();
      return supplierMfr.includes(storeMfr) || storeMfr.includes(supplierMfr);
    });
    candidates = [...new Set([...candidates, ...mfrMatches])];
  }

  // Strategy 3: Similar full part numbers
  if (candidates.length < maxCandidates) {
    const storePart = storeItem.partNumber.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    const partMatches = supplierItems.filter((s) => {
      const supplierPart = s.partNumber.replace(/[^A-Z0-9]/gi, '').toUpperCase();
      return supplierPart.includes(storePart.substring(0, 5)) || 
             storePart.includes(supplierPart.substring(0, 5));
    });
    candidates = [...new Set([...candidates, ...partMatches])];
  }

  // Return top candidates
  return candidates.slice(0, maxCandidates);
}
