/**
 * Extract matching rules from interchange file data
 * Creates rules that map supplier parts to store parts
 */

interface InterchangeRule {
  ruleType: string;
  pattern: any;
  transformation: string;
  scope: string;
  scopeId: string;
  confidence: number;
  source: string;
  sourceFileId?: string;
  sourceFileName?: string;
  active: boolean;
}

/**
 * Extract rules from interchange mappings
 * Each interchange mapping becomes a direct part number substitution rule
 */
export function extractRulesFromInterchange(
  interchangeMappings: Array<{
    competitorFullSku: string;
    competitorLineCode: string | null;
    competitorPartNumber: string;
    arnoldFullSku: string;
    arnoldLineCode: string | null;
    arnoldPartNumber: string;
  }>,
  projectId: string,
  fileName: string
): InterchangeRule[] {
  const rules: InterchangeRule[] = [];
  const seenPairs = new Set<string>();

  for (const mapping of interchangeMappings) {
    // Create a unique key to avoid duplicates
    const pairKey = `${mapping.competitorFullSku}→${mapping.arnoldFullSku}`;
    
    if (seenPairs.has(pairKey)) {
      continue;
    }
    seenPairs.add(pairKey);

    // Rule 1: Direct full SKU mapping
    rules.push({
      ruleType: 'interchange_mapping',
      pattern: {
        type: 'exact_match',
        from: mapping.competitorFullSku,
        to: mapping.arnoldFullSku,
        fromLineCode: mapping.competitorLineCode,
        toLineCode: mapping.arnoldLineCode,
      },
      transformation: `${mapping.competitorFullSku} → ${mapping.arnoldFullSku}`,
      scope: 'project',
      scopeId: projectId,
      confidence: 1.0,
      source: 'interchange',
      sourceFileName: fileName,
      active: true,
    });

    // Rule 2: Part number mapping (without line codes) if different from full SKU
    if (
      mapping.competitorPartNumber &&
      mapping.arnoldPartNumber &&
      mapping.competitorPartNumber !== mapping.competitorFullSku
    ) {
      const partPairKey = `${mapping.competitorPartNumber}→${mapping.arnoldPartNumber}`;
      
      if (!seenPairs.has(partPairKey)) {
        seenPairs.add(partPairKey);
        
        rules.push({
          ruleType: 'interchange_mapping',
          pattern: {
            type: 'part_number_match',
            from: mapping.competitorPartNumber,
            to: mapping.arnoldPartNumber,
          },
          transformation: `${mapping.competitorPartNumber} → ${mapping.arnoldPartNumber} (normalized)`,
          scope: 'project',
          scopeId: projectId,
          confidence: 0.95, // Slightly lower confidence for normalized matches
          source: 'interchange',
          sourceFileName: fileName,
          active: true,
        });
      }
    }
  }

  console.log(`[RULE EXTRACTION] Generated ${rules.length} rules from ${interchangeMappings.length} interchange mappings`);
  return rules;
}

/**
 * Deduplicate rules by pattern
 * Keeps the highest confidence rule for each unique pattern
 */
export function deduplicateRules(rules: InterchangeRule[]): InterchangeRule[] {
  const ruleMap = new Map<string, InterchangeRule>();

  for (const rule of rules) {
    const key = JSON.stringify(rule.pattern);
    const existing = ruleMap.get(key);

    if (!existing || rule.confidence > existing.confidence) {
      ruleMap.set(key, rule);
    }
  }

  return Array.from(ruleMap.values());
}
