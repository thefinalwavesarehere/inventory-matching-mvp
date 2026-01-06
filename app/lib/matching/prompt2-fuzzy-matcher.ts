/**
 * Prompt 2: Fuzzy Matcher with Quality Guardrails
 * 
 * Improvements over legacy fuzzy:
 * - Hard rejects (category/subcategory mismatch, line code incompatibility, extreme description mismatch)
 * - Composite scoring (part similarity + description + cost + rule boosts)
 * - Collision prevention ("51515 problem" - same mfr part across unrelated lines)
 * - Interchange-first prioritization (skip fuzzy if V4 exact exists)
 * - Rule-based boosts (only if approved)
 */

import prisma from '@/app/lib/db/prisma';

interface FuzzyCandidate {
  storeItemId: string;
  supplierItemId: string;
  confidence: number;
  method: string;
  features: any;
  rejectReason?: string;
}

interface ProjectConfig {
  enableRuleBasedFuzzyBoosts: boolean;
  enablePunctuationEquivalence: boolean;
  fuzzyHardRejectEnabled: boolean;
}

/**
 * C1: Hard reject filters
 */
async function applyHardRejects(
  storeItem: any,
  supplierItem: any,
  config: ProjectConfig
): Promise<string | null> {
  if (!config.fuzzyHardRejectEnabled) {
    return null; // Hard rejects disabled
  }

  // Filter 1: Category/Subcategory mismatch
  if (storeItem.subcategory && supplierItem.subcategory) {
    const storeSub = storeItem.subcategory.toLowerCase();
    const supplierSub = supplierItem.subcategory.toLowerCase();
    
    // Check for obvious incompatibilities
    const incompatiblePairs = [
      ['clip', 'cable'],
      ['battery', 'belt'],
      ['hose', 'wiring'],
      ['axle', 'brake'],
    ];
    
    for (const [a, b] of incompatiblePairs) {
      if ((storeSub.includes(a) && supplierSub.includes(b)) ||
          (storeSub.includes(b) && supplierSub.includes(a))) {
        return `SUBCATEGORY_MISMATCH: ${storeItem.subcategory} vs ${supplierItem.subcategory}`;
      }
    }
  }

  // Filter 2: Line code/manufacturer incompatibility
  // Check if there's an APPROVED mapping that contradicts this match
  if (storeItem.arnoldLineCodeRaw) {
    const mapping = await prisma.projectLineCodeMapping.findFirst({
      where: {
        projectId: storeItem.projectId,
        sourceLineCode: storeItem.arnoldLineCodeRaw,
        status: 'APPROVED',
      },
    });

    if (mapping && mapping.mappedManufacturer) {
      // If supplier has a known manufacturer and it doesn't match, reject
      if (supplierItem.brand && 
          supplierItem.brand.toLowerCase() !== mapping.mappedManufacturer.toLowerCase()) {
        return `LINECODE_MANUFACTURER_MISMATCH: ${storeItem.arnoldLineCodeRaw} → ${mapping.mappedManufacturer}, but supplier is ${supplierItem.brand}`;
      }
    }
  }

  // Filter 3: Extreme description mismatch
  if (storeItem.description && supplierItem.description) {
    const descSimilarity = calculateDescriptionSimilarity(
      storeItem.description,
      supplierItem.description
    );
    
    const partSimilarity = calculatePartSimilarity(
      storeItem.partNumberNorm,
      supplierItem.partNumberNorm
    );

    // If both description and part are very dissimilar, reject
    if (descSimilarity < 0.2 && partSimilarity < 0.4) {
      return `EXTREME_MISMATCH: descSim=${descSimilarity.toFixed(2)}, partSim=${partSimilarity.toFixed(2)}`;
    }
  }

  return null; // No reject
}

/**
 * C2: Composite scoring
 */
function calculateCompositeScore(
  storeItem: any,
  supplierItem: any,
  config: ProjectConfig,
  approvedRules: any[]
): { confidence: number; features: any } {
  const features: any = {
    partSimilarity: 0,
    descriptionSimilarity: 0,
    costSanity: 0,
    ruleBoosts: [],
  };

  // Part similarity (fullSkuNorm)
  features.partSimilarity = calculatePartSimilarity(
    storeItem.partNumberNorm,
    supplierItem.partNumberNorm
  );

  // Manufacturer part similarity (if present)
  if (storeItem.manufacturerPartNorm && supplierItem.manufacturerPartNorm) {
    features.mfrPartSimilarity = calculatePartSimilarity(
      storeItem.manufacturerPartNorm,
      supplierItem.manufacturerPartNorm
    );
  }

  // Description similarity
  if (storeItem.description && supplierItem.description) {
    features.descriptionSimilarity = calculateDescriptionSimilarity(
      storeItem.description,
      supplierItem.description
    );
  }

  // Cost sanity
  if (storeItem.currentCost && supplierItem.cost) {
    const ratio = Number(storeItem.currentCost) / Number(supplierItem.cost);
    if (ratio >= 0.5 && ratio <= 2.0) {
      features.costSanity = 1.0 - Math.abs(1.0 - ratio);
    } else {
      features.costSanity = -0.5; // Penalty for huge divergence
    }
  }

  // Rule boosts (only if enabled and rules approved)
  if (config.enableRuleBasedFuzzyBoosts) {
    for (const rule of approvedRules) {
      if (rule.ruleType === 'PUNCTUATION_EQUIVALENCE' && config.enablePunctuationEquivalence) {
        // Check if parts differ only by punctuation
        const storeRaw = storeItem.partNumber || '';
        const supplierRaw = supplierItem.partNumber || '';
        const storeNoPunct = storeRaw.replace(/[-\/\.]/g, '');
        const supplierNoPunct = supplierRaw.replace(/[-\/\.]/g, '');
        
        if (storeNoPunct.toUpperCase() === supplierNoPunct.toUpperCase()) {
          features.ruleBoosts.push({ ruleId: rule.id, type: 'PUNCTUATION_EQUIVALENCE', boost: 0.1 });
        }
      }
    }
  }

  // Weighted composite score
  let confidence = 0;
  confidence += features.partSimilarity * 0.4;
  confidence += features.descriptionSimilarity * 0.3;
  confidence += (features.mfrPartSimilarity || 0) * 0.2;
  confidence += Math.max(0, features.costSanity) * 0.1;

  // Apply rule boosts
  for (const boost of features.ruleBoosts) {
    confidence += boost.boost;
  }

  // Cap at 1.0
  confidence = Math.min(1.0, confidence);

  return { confidence, features };
}

/**
 * C3: Collision prevention ("51515 problem")
 */
async function checkCollision(
  storeItem: any,
  supplierItem: any,
  projectId: string
): Promise<{ isAmbiguous: boolean; hasDisambiguator: boolean }> {
  // Check if manufacturerPartNorm matches many candidates across different manufacturers
  if (!storeItem.manufacturerPartNorm) {
    return { isAmbiguous: false, hasDisambiguator: true };
  }

  // Count how many different manufacturers have this part
  const manufacturerCount = await prisma.supplierItem.groupBy({
    by: ['brand'],
    where: {
      partNumberNorm: storeItem.manufacturerPartNorm,
    },
    _count: true,
  });

  const isAmbiguous = manufacturerCount.length > 2;

  if (!isAmbiguous) {
    return { isAmbiguous: false, hasDisambiguator: true };
  }

  // Check for disambiguators
  let hasDisambiguator = false;

  // Disambiguator 1: Approved line code mapping
  if (storeItem.arnoldLineCodeRaw) {
    const mapping = await prisma.projectLineCodeMapping.findFirst({
      where: {
        projectId,
        sourceLineCode: storeItem.arnoldLineCodeRaw,
        status: 'APPROVED',
        mappedManufacturer: supplierItem.brand,
      },
    });
    if (mapping) {
      hasDisambiguator = true;
    }
  }

  // Disambiguator 2: High description similarity
  if (storeItem.description && supplierItem.description) {
    const descSim = calculateDescriptionSimilarity(storeItem.description, supplierItem.description);
    if (descSim > 0.7) {
      hasDisambiguator = true;
    }
  }

  // Disambiguator 3: Interchange bridge exists
  const interchangeExists = await prisma.interchange.findFirst({
    where: {
      projectId,
      OR: [
        { merrillPartNumberNorm: storeItem.partNumberNorm },
        { vendorPartNumberNorm: storeItem.partNumberNorm },
      ],
    },
  });
  if (interchangeExists) {
    hasDisambiguator = true;
  }

  return { isAmbiguous, hasDisambiguator };
}

/**
 * C4: Skip fuzzy if V4 exact exists
 */
async function hasExactMatch(storeItemId: string): Promise<boolean> {
  const existing = await prisma.matchCandidate.findFirst({
    where: {
      storeItemId,
      method: 'INTERCHANGE',
    },
  });
  return !!existing;
}

/**
 * Main fuzzy matching function
 */
export async function findFuzzyCandidates(
  projectId: string,
  storeIds?: string[]
): Promise<FuzzyCandidate[]> {
  console.log(`[PROMPT2-FUZZY] Starting fuzzy matching for project ${projectId}`);

  // Get project config
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      enableRuleBasedFuzzyBoosts: true,
      enablePunctuationEquivalence: true,
      fuzzyHardRejectEnabled: true,
    },
  });

  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }

  const config: ProjectConfig = {
    enableRuleBasedFuzzyBoosts: project.enableRuleBasedFuzzyBoosts,
    enablePunctuationEquivalence: project.enablePunctuationEquivalence,
    fuzzyHardRejectEnabled: project.fuzzyHardRejectEnabled,
  };

  // Get approved rules
  const approvedRules = await prisma.projectMatchRule.findMany({
    where: {
      projectId,
      status: 'APPROVED',
    },
  });

  console.log(`[PROMPT2-FUZZY] Config: ${JSON.stringify(config)}, Approved rules: ${approvedRules.length}`);

  // Get store items (skip those with exact matches)
  const storeItems = await prisma.storeItem.findMany({
    where: {
      projectId,
      ...(storeIds && storeIds.length > 0 ? { id: { in: storeIds } } : {}),
    },
    include: {
      matchCandidates: {
        where: { method: 'INTERCHANGE' },
        take: 1,
      },
    },
  });

  console.log(`[PROMPT2-FUZZY] Found ${storeItems.length} store items`);

  // Filter out items with exact matches
  const itemsNeedingFuzzy = storeItems.filter(item => item.matchCandidates.length === 0);
  console.log(`[PROMPT2-FUZZY] ${itemsNeedingFuzzy.length} items need fuzzy matching (${storeItems.length - itemsNeedingFuzzy.length} already have exact matches)`);

  const candidates: FuzzyCandidate[] = [];

  // For each store item, find fuzzy candidates
  for (const storeItem of itemsNeedingFuzzy) {
    // Simple fuzzy: find supplier items with similar partNumberNorm
    const supplierItems = await prisma.supplierItem.findMany({
      where: {
        partNumberNorm: {
          contains: storeItem.partNumberNorm.substring(0, 5), // Prefix match
        },
      },
      take: 10,
    });

    for (const supplierItem of supplierItems) {
      // Apply hard rejects
      const rejectReason = await applyHardRejects(storeItem, supplierItem, config);
      if (rejectReason) {
        console.log(`[PROMPT2-FUZZY] REJECT: ${storeItem.partNumber} → ${supplierItem.partNumber}: ${rejectReason}`);
        continue;
      }

      // Calculate composite score
      const { confidence, features } = calculateCompositeScore(storeItem, supplierItem, config, approvedRules);

      // Check collision
      const { isAmbiguous, hasDisambiguator } = await checkCollision(storeItem, supplierItem, projectId);

      if (isAmbiguous && !hasDisambiguator) {
        // Cap confidence for ambiguous matches
        const cappedConfidence = Math.min(confidence, 0.6);
        console.log(`[PROMPT2-FUZZY] COLLISION: ${storeItem.partNumber} → ${supplierItem.partNumber}: confidence capped ${confidence.toFixed(2)} → ${cappedConfidence.toFixed(2)}`);
        
        candidates.push({
          storeItemId: storeItem.id,
          supplierItemId: supplierItem.id,
          confidence: cappedConfidence,
          method: 'FUZZY_V2',
          features: {
            ...features,
            collision: { isAmbiguous, hasDisambiguator },
          },
        });
      } else {
        candidates.push({
          storeItemId: storeItem.id,
          supplierItemId: supplierItem.id,
          confidence,
          method: 'FUZZY_V2',
          features,
        });
      }
    }
  }

  console.log(`[PROMPT2-FUZZY] Generated ${candidates.length} fuzzy candidates`);

  return candidates;
}

/**
 * Helper: Calculate part similarity (Jaro-Winkler)
 */
function calculatePartSimilarity(part1: string, part2: string): number {
  if (!part1 || !part2) return 0;
  
  // Simple Jaro-Winkler approximation
  const longer = part1.length > part2.length ? part1 : part2;
  const shorter = part1.length > part2.length ? part2 : part1;
  
  if (longer.length === 0) return 1.0;
  
  const matchDistance = Math.floor(longer.length / 2) - 1;
  const longerMatches = new Array(longer.length).fill(false);
  const shorterMatches = new Array(shorter.length).fill(false);
  
  let matches = 0;
  for (let i = 0; i < shorter.length; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, longer.length);
    
    for (let j = start; j < end; j++) {
      if (longerMatches[j] || shorter[i] !== longer[j]) continue;
      shorterMatches[i] = true;
      longerMatches[j] = true;
      matches++;
      break;
    }
  }
  
  if (matches === 0) return 0;
  
  return matches / longer.length;
}

/**
 * Helper: Calculate description similarity (token overlap)
 */
function calculateDescriptionSimilarity(desc1: string, desc2: string): number {
  if (!desc1 || !desc2) return 0;
  
  const tokens1 = new Set(desc1.toLowerCase().split(/\s+/));
  const tokens2 = new Set(desc2.toLowerCase().split(/\s+/));
  
  const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
  const union = new Set([...tokens1, ...tokens2]);
  
  return intersection.size / union.size;
}
