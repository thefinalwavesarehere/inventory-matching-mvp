/**
 * Background Job Processors
 * Comprehensive matching logic combining AI and multi-strategy web search
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
 * Process web search matching using multi-strategy approach
 * Strategy 1: Aggressive catalog matching
 * Strategy 2: Pattern-based inference
 * Strategy 3: AI-powered intelligent matching
 */
export async function processWebSearchMatching(
  storeItems: any[],
  supplierItems: any[],
  projectId: string
): Promise<number> {
  let matchCount = 0;

  for (const storeItem of storeItems) {
    try {
      console.log(`[WEB-SEARCH] Processing ${storeItem.partNumber}...`);

      // Strategy 1: Aggressive catalog matching with confidence scoring
      const catalogMatch = findBestCatalogMatch(storeItem, supplierItems);
      if (catalogMatch && catalogMatch.confidence >= 0.65) {
        await createMatchCandidate(projectId, storeItem, catalogMatch.supplier, catalogMatch.confidence, {
          method: 'aggressive_catalog',
          reason: catalogMatch.reason,
        });
        matchCount++;
        console.log(`[WEB-SEARCH] Catalog match: ${storeItem.partNumber} -> ${catalogMatch.supplier.partNumber} (${catalogMatch.confidence})`);
        continue;
      }

      // Strategy 2: Pattern-based inference
      const patternMatch = await inferMatchFromPattern(storeItem, supplierItems);
      if (patternMatch) {
        const supplier = await getOrCreateSupplier(projectId, patternMatch);
        await createMatchCandidate(projectId, storeItem, supplier, patternMatch.confidence, {
          method: 'pattern_inference',
          reason: patternMatch.reason,
        });
        matchCount++;
        console.log(`[WEB-SEARCH] Pattern match: ${storeItem.partNumber} -> ${patternMatch.partNumber} (${patternMatch.confidence})`);
        continue;
      }

      // Strategy 3: AI-powered intelligent matching
      const aiMatch = await intelligentAIMatch(storeItem, supplierItems);
      if (aiMatch) {
        const supplier = await getOrCreateSupplier(projectId, aiMatch);
        await createMatchCandidate(projectId, storeItem, supplier, aiMatch.confidence, {
          method: 'ai_intelligent',
          reason: aiMatch.reason,
        });
        matchCount++;
        console.log(`[WEB-SEARCH] AI match: ${storeItem.partNumber} -> ${aiMatch.partNumber} (${aiMatch.confidence})`);
        continue;
      }

      console.log(`[WEB-SEARCH] No match found for ${storeItem.partNumber}`);

    } catch (error) {
      console.error(`[WEB-SEARCH] Error processing ${storeItem.partNumber}:`, error);
    }
  }

  return matchCount;
}

/**
 * Find best catalog match with aggressive matching rules
 */
function findBestCatalogMatch(storeItem: any, supplierItems: any[]): any | null {
  const storePart = storeItem.partNumber.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const storeDesc = (storeItem.description || '').toUpperCase();
  
  let bestMatch: any = null;
  let bestScore = 0;

  for (const supplier of supplierItems) {
    const supplierPart = supplier.partNumber.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    const supplierDesc = (supplier.description || '').toUpperCase();
    
    let score = 0;
    let reasons: string[] = [];

    // Exact normalized match
    if (supplierPart === storePart) {
      score = 1.0;
      reasons.push('exact match');
    }
    // Core number match (remove line codes)
    else if (storeItem.lineCode && supplier.lineCode) {
      const storeCore = storePart.replace(storeItem.lineCode.replace(/[^A-Z0-9]/gi, '').toUpperCase(), '');
      const supplierCore = supplierPart.replace(supplier.lineCode.replace(/[^A-Z0-9]/gi, '').toUpperCase(), '');
      if (storeCore === supplierCore && storeCore.length >= 4) {
        score = 0.95;
        reasons.push('core number match');
      }
    }
    // Substring match (one contains the other)
    else if (supplierPart.includes(storePart) || storePart.includes(supplierPart)) {
      const longer = Math.max(supplierPart.length, storePart.length);
      const shorter = Math.min(supplierPart.length, storePart.length);
      score = shorter / longer * 0.9;
      reasons.push('substring match');
    }
    // High similarity
    else {
      const similarity = calculateSimilarity(storePart, supplierPart);
      if (similarity >= 0.75) {
        score = similarity * 0.85;
        reasons.push(`${Math.round(similarity * 100)}% similar`);
      }
    }

    // Boost score if descriptions match
    if (score > 0 && storeDesc && supplierDesc) {
      const descWords1 = storeDesc.split(/\s+/).filter((w: string) => w.length > 3);
      const descWords2 = supplierDesc.split(/\s+/).filter((w: string) => w.length > 3);
      const commonWords = descWords1.filter((w: string) => descWords2.includes(w));
      if (commonWords.length >= 2) {
        score = Math.min(1.0, score + 0.1);
        reasons.push('description match');
      }
    }

    // Boost score if manufacturer part numbers match
    if (score > 0 && storeItem.mfrPartNumber && supplier.mfrPartNumber) {
      const storeMfr = storeItem.mfrPartNumber.replace(/[^A-Z0-9]/gi, '').toUpperCase();
      const supplierMfr = supplier.mfrPartNumber.replace(/[^A-Z0-9]/gi, '').toUpperCase();
      if (storeMfr === supplierMfr) {
        score = Math.min(1.0, score + 0.15);
        reasons.push('mfr part match');
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = {
        supplier,
        confidence: score,
        reason: reasons.join(', '),
      };
    }
  }

  return bestMatch;
}

/**
 * Infer match from common automotive part number patterns
 */
async function inferMatchFromPattern(storeItem: any, supplierItems: any[]): Promise<any | null> {
  const storePart = storeItem.partNumber.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  
  // Common automotive part number patterns:
  // 1. Line code + core number (e.g., ABC123 -> 123, DEF123)
  // 2. Prefix variations (e.g., AC123 -> AELAC123, DLPAC123)
  // 3. Suffix additions (e.g., 123 -> 123A, 123B)
  
  // Extract potential core number (remove common prefixes)
  const commonPrefixes = ['AEL', 'DLP', 'BAT', 'ABC', 'DEF', 'LTG', 'MFR'];
  let coreNumber = storePart;
  
  for (const prefix of commonPrefixes) {
    if (storePart.startsWith(prefix)) {
      coreNumber = storePart.substring(prefix.length);
      break;
    }
  }

  // Look for matches with this core number
  if (coreNumber.length >= 4) {
    for (const supplier of supplierItems) {
      const supplierPart = supplier.partNumber.replace(/[^A-Z0-9]/gi, '').toUpperCase();
      
      // Check if supplier part ends with or contains the core number
      if (supplierPart.includes(coreNumber)) {
        return {
          partNumber: supplier.partNumber,
          description: supplier.description,
          confidence: 0.75,
          reason: `Core number ${coreNumber} found in supplier part`,
          isExisting: true,
          supplierId: supplier.id,
        };
      }
    }
  }

  // If no match found, return null (AI will try next)
  return null;
}

/**
 * Use AI to intelligently match or infer part numbers
 */
async function intelligentAIMatch(storeItem: any, supplierItems: any[]): Promise<any | null> {
  try {
    // Get top candidates for context
    const candidates = supplierItems
      .map(s => ({
        part: s.partNumber,
        desc: s.description || '',
        line: s.lineCode || '',
      }))
      .slice(0, 30);

    const prompt = `You are an automotive parts expert. Find or infer the MOST LIKELY matching part number for this store part.

Store Part:
- Part: ${storeItem.partNumber}
- Desc: ${storeItem.description || 'N/A'}
- Line: ${storeItem.lineCode || 'N/A'}
- Mfr: ${storeItem.mfrPartNumber || 'N/A'}

Available Supplier Parts (for reference):
${candidates.map((c, i) => `${i + 1}. ${c.part}${c.desc ? ` - ${c.desc}` : ''}`).slice(0, 15).join('\n')}

MATCHING STRATEGIES:
1. **Check supplier list first** - exact or close match
2. **Remove line codes** - ABC123 might match 123, DEF123, etc.
3. **Add common prefixes** - 123 might be AEL123, DLP123, BAT123
4. **Ignore punctuation** - ABC-123 = ABC.123 = ABC123
5. **Be creative** - infer likely matches based on patterns

IMPORTANT: 
- If you find a match in the supplier list, use that EXACT part number
- If not, infer a likely part number based on common automotive patterns
- Be generous - 60%+ confidence is acceptable

Respond with ONLY valid JSON:
{
  "found": true/false,
  "partNumber": "EXACT_PART_NUMBER",
  "confidence": 0.6-1.0,
  "reason": "Brief explanation",
  "isExisting": true/false
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an expert automotive parts matcher. Be generous and creative. Always respond with valid JSON only.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.4,
      max_tokens: 200,
    });

    let responseText = response.choices[0]?.message?.content?.trim();
    if (!responseText) return null;

    responseText = responseText
      .replace(/^```json/gm, '')
      .replace(/^```/gm, '')
      .replace(/`/g, '')
      .trim();

    const result = JSON.parse(responseText);

    if (result.found && result.partNumber && result.confidence >= 0.6) {
      // Check if this part exists in supplier catalog
      const existing = supplierItems.find(
        s => s.partNumber.replace(/[^A-Z0-9]/gi, '').toUpperCase() === 
             result.partNumber.replace(/[^A-Z0-9]/gi, '').toUpperCase()
      );

      return {
        partNumber: result.partNumber,
        description: storeItem.description,
        confidence: result.confidence,
        reason: result.reason,
        isExisting: !!existing,
        supplierId: existing?.id,
      };
    }

    return null;
  } catch (error) {
    console.error('[WEB-SEARCH] AI match error:', error);
    return null;
  }
}

/**
 * Get existing supplier or create new one
 */
async function getOrCreateSupplier(projectId: string, matchData: any): Promise<any> {
  if (matchData.isExisting && matchData.supplierId) {
    return await prisma.supplierItem.findUnique({
      where: { id: matchData.supplierId },
    });
  }

  // Create new supplier item
  return await prisma.supplierItem.create({
    data: {
      projectId,
      supplier: 'Inferred Match',
      partNumber: matchData.partNumber,
      partFull: matchData.partNumber,
      partNumberNorm: matchData.partNumber.replace(/[^A-Z0-9]/gi, '').toUpperCase(),
      description: matchData.description || null,
      currentCost: null,
    },
  });
}

/**
 * Create match candidate
 */
async function createMatchCandidate(
  projectId: string,
  storeItem: any,
  supplier: any,
  confidence: number,
  details: any
) {
  await prisma.matchCandidate.create({
    data: {
      projectId,
      storeItemId: storeItem.id,
      targetType: 'SUPPLIER',
      targetId: supplier.id,
      method: 'WEB_SEARCH',
      confidence,
      matchStage: 4,
      status: 'PENDING',
      features: {
        ...details,
        model: 'multi-strategy',
      },
    },
  });
}

/**
 * Calculate string similarity using Levenshtein distance
 */
function calculateSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) return 1.0;
  
  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

/**
 * Levenshtein distance algorithm
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
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
