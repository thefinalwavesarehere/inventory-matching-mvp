import fs from 'fs';
import path from 'path';

import {
  runMultiStageMatching,
  type StoreItem,
  type SupplierItem,
  type InterchangeMapping,
  type MatchingRule,
} from '../app/lib/matching-engine';
import { loadMatchingConfig } from '../app/lib/matching-config';
import { createTelemetryLogger } from '../app/lib/telemetry';

type GoldenFixture = {
  storeItems: StoreItem[];
  supplierItems: SupplierItem[];
  interchanges: InterchangeMapping[];
  rules: MatchingRule[];
  expectations: { storeItemId: string; expectedSupplierIds: string[] }[];
};

function loadFixture(): GoldenFixture {
  const fixturePath = path.join(process.cwd(), 'scripts/fixtures/golden-matches.json');
  const raw = fs.readFileSync(fixturePath, 'utf-8');
  return JSON.parse(raw);
}

function computeScores(
  expectations: GoldenFixture['expectations'],
  matches: Awaited<ReturnType<typeof runMultiStageMatching>>['matches'],
) {
  let expectedCount = 0;
  let correct = 0;
  const matchedByStore = new Map<string, Set<string>>();

  for (const match of matches) {
    if (!matchedByStore.has(match.storeItemId)) {
      matchedByStore.set(match.storeItemId, new Set());
    }
    matchedByStore.get(match.storeItemId)!.add(match.supplierItemId);
  }

  for (const expectation of expectations) {
    expectedCount += expectation.expectedSupplierIds.length;
    const found = matchedByStore.get(expectation.storeItemId) || new Set();
    for (const expected of expectation.expectedSupplierIds) {
      if (found.has(expected)) {
        correct += 1;
      }
    }
  }

  const precision = matches.length > 0 ? correct / matches.length : 0;
  const recall = expectedCount > 0 ? correct / expectedCount : 0;

  return { precision, recall, correct, expectedCount, matched: matches.length };
}

async function run() {
  const telemetry = createTelemetryLogger('golden-harness', {
    traceId: `golden-${Date.now()}`,
  });

  telemetry.info('Loading golden dataset');
  const fixture = loadFixture();

  const config = loadMatchingConfig();
  telemetry.info('Resolved matching config', { config });

  const result = await runMultiStageMatching(
    fixture.storeItems,
    fixture.supplierItems,
    fixture.interchanges,
    fixture.rules,
    {
      fuzzyThreshold: config.thresholds.fuzzySimilarity,
      costTolerancePercent: config.thresholds.costTolerancePercent,
      maxCandidatesPerItem: config.limits.maxCandidatesPerItem,
      maxTopMatches: config.limits.maxTopMatches,
      telemetryLogger: telemetry,
    },
  );

  const scores = computeScores(fixture.expectations, result.matches);

  telemetry.logSummary('Golden dataset results', {
    precision: Number(scores.precision.toFixed(3)),
    recall: Number(scores.recall.toFixed(3)),
    correct: scores.correct,
    expected: scores.expectedCount,
    matched: scores.matched,
  });

  console.log('--- Golden Dataset Report ---');
  console.log(`Total store items: ${fixture.storeItems.length}`);
  console.log(`Matches found: ${result.matches.length}`);
  console.log(`Precision: ${(scores.precision * 100).toFixed(1)}%`);
  console.log(`Recall: ${(scores.recall * 100).toFixed(1)}%`);
}

run().catch(err => {
  console.error('Golden dataset run failed', err);
  process.exit(1);
});
