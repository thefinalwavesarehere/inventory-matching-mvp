import { z } from 'zod';

const booleanFromEnv = (key: string, defaultValue: boolean) => {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
};

const numberFromEnv = (key: string, defaultValue: number) => {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
};

export const matchingConfigSchema = z.object({
  flags: z.object({
    deterministicEnabled: z.boolean(),
    fuzzyEnabled: z.boolean(),
    aiCatalogEnabled: z.boolean(),
    aiWebSearchEnabled: z.boolean(),
  }),
  modes: z.object({
    defaultMode: z.enum(['deterministic-only', 'deterministic+fuzzy', 'full-ai']),
  }),
  thresholds: z.object({
    fuzzySimilarity: z.number().min(0).max(1),
    aiCatalogConfidence: z.number().min(0).max(1),
    aiWebSearchConfidence: z.number().min(0).max(1),
    costTolerancePercent: z.number().nonnegative(),
  }),
  limits: z.object({
    maxCandidatesPerItem: z.number().positive(),
    maxTopMatches: z.number().positive(),
  }),
});

export type MatchingConfig = z.infer<typeof matchingConfigSchema>;

const DEFAULT_MATCHING_CONFIG: MatchingConfig = {
  flags: {
    deterministicEnabled: true,
    fuzzyEnabled: true,
    aiCatalogEnabled: false,
    aiWebSearchEnabled: false,
  },
  modes: {
    defaultMode: 'deterministic+fuzzy',
  },
  thresholds: {
    fuzzySimilarity: 0.65,
    aiCatalogConfidence: 0.6,
    aiWebSearchConfidence: 0.6,
    costTolerancePercent: 10,
  },
  limits: {
    maxCandidatesPerItem: 1000,
    maxTopMatches: 5,
  },
};

export function loadMatchingConfig(): MatchingConfig {
  const config: MatchingConfig = {
    flags: {
      deterministicEnabled: booleanFromEnv('MATCH_STAGE1_ENABLED', DEFAULT_MATCHING_CONFIG.flags.deterministicEnabled),
      fuzzyEnabled: booleanFromEnv('MATCH_STAGE2_ENABLED', DEFAULT_MATCHING_CONFIG.flags.fuzzyEnabled),
      aiCatalogEnabled: booleanFromEnv('MATCH_STAGE3_ENABLED', DEFAULT_MATCHING_CONFIG.flags.aiCatalogEnabled),
      aiWebSearchEnabled: booleanFromEnv('MATCH_STAGE4_ENABLED', DEFAULT_MATCHING_CONFIG.flags.aiWebSearchEnabled),
    },
    modes: {
      defaultMode: (process.env.MATCH_PIPELINE_MODE as MatchingConfig['modes']['defaultMode'])
        || DEFAULT_MATCHING_CONFIG.modes.defaultMode,
    },
    thresholds: {
      fuzzySimilarity: numberFromEnv('MATCH_FUZZY_THRESHOLD', DEFAULT_MATCHING_CONFIG.thresholds.fuzzySimilarity),
      aiCatalogConfidence: numberFromEnv('MATCH_AI_CATALOG_CONFIDENCE', DEFAULT_MATCHING_CONFIG.thresholds.aiCatalogConfidence),
      aiWebSearchConfidence: numberFromEnv('MATCH_AI_WEB_CONFIDENCE', DEFAULT_MATCHING_CONFIG.thresholds.aiWebSearchConfidence),
      costTolerancePercent: numberFromEnv('MATCH_COST_TOLERANCE_PERCENT', DEFAULT_MATCHING_CONFIG.thresholds.costTolerancePercent),
    },
    limits: {
      maxCandidatesPerItem: numberFromEnv('MATCH_MAX_CANDIDATES', DEFAULT_MATCHING_CONFIG.limits.maxCandidatesPerItem),
      maxTopMatches: numberFromEnv('MATCH_MAX_TOP_MATCHES', DEFAULT_MATCHING_CONFIG.limits.maxTopMatches),
    },
  };

  return matchingConfigSchema.parse(config);
}

export function describeMatchingConfig(config: MatchingConfig): Record<string, unknown> {
  return {
    flags: config.flags,
    modes: config.modes,
    thresholds: config.thresholds,
    limits: config.limits,
  };
}

export { DEFAULT_MATCHING_CONFIG };
