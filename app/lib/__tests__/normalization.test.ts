/**
 * Unit tests for normalization utilities
 * Run with: npm test
 */

import {
  extractLineCode,
  normalizePartNumber,
  arePartsEquivalent,
  computeTransformationSignature,
  compareCosts,
  detectUnitMismatch,
} from '../normalization';

describe('extractLineCode', () => {
  test('extracts line code from Arnold-style part numbers', () => {
    expect(extractLineCode('01M000-2112-73')).toEqual({
      lineCode: '01M',
      mfrPartNumber: '000-2112-73',
    });

    expect(extractLineCode('ABC10026A')).toEqual({
      lineCode: 'ABC',
      mfrPartNumber: '10026A',
    });

    expect(extractLineCode('PPG21-3-1')).toEqual({
      lineCode: 'PPG',
      mfrPartNumber: '21-3-1',
    });
  });

  test('handles short part numbers', () => {
    expect(extractLineCode('AB')).toEqual({
      lineCode: null,
      mfrPartNumber: 'AB',
    });

    expect(extractLineCode('')).toEqual({
      lineCode: null,
      mfrPartNumber: null,
    });
  });

  test('handles exactly 3 characters', () => {
    expect(extractLineCode('ABC')).toEqual({
      lineCode: 'ABC',
      mfrPartNumber: null,
    });
  });
});

describe('normalizePartNumber', () => {
  test('creates canonical form by removing punctuation', () => {
    const result = normalizePartNumber('000-2112-73');
    expect(result.canonical).toBe('000211273');
    expect(result.original).toBe('000-2112-73');
  });

  test('handles slashes', () => {
    const result = normalizePartNumber('21/3/1');
    expect(result.canonical).toBe('2131');
  });

  test('handles mixed punctuation', () => {
    const result = normalizePartNumber('GM-8036.5');
    expect(result.canonical).toBe('GM80365');
  });

  test('extracts line code when requested', () => {
    const result = normalizePartNumber('ABC10026A', { extractLineCode: true });
    expect(result.lineCode).toBe('ABC');
    expect(result.mfrPartNumber).toBe('10026A');
    expect(result.canonical).toBe('ABC10026A');
  });

  test('preserves case when requested', () => {
    const result = normalizePartNumber('AbC123', { preserveCase: true });
    expect(result.canonical).toBe('AbC123');
  });

  test('removes spaces', () => {
    const result = normalizePartNumber('GM 8036');
    expect(result.canonical).toBe('GM8036');
  });
});

describe('arePartsEquivalent', () => {
  test('identifies equivalent parts with different punctuation', () => {
    expect(arePartsEquivalent('21-3-1', '21/3/1')).toBe(true);
    expect(arePartsEquivalent('GM-8036', 'GM8036')).toBe(true);
    expect(arePartsEquivalent('000-2112-73', '000.2112.73')).toBe(true);
  });

  test('identifies non-equivalent parts', () => {
    expect(arePartsEquivalent('21-3-1', '21-3-2')).toBe(false);
    expect(arePartsEquivalent('GM-8036', 'GM-8037')).toBe(false);
  });

  test('handles case insensitivity', () => {
    expect(arePartsEquivalent('abc123', 'ABC123')).toBe(true);
  });
});

describe('computeTransformationSignature', () => {
  test('detects slash to dash transformation', () => {
    const sig = computeTransformationSignature('21/3/1', '21-3-1');
    expect(sig).toBe('slash_to_dash');
  });

  test('detects dash removal', () => {
    const sig = computeTransformationSignature('GM-8036', 'GM8036');
    expect(sig).toBe('remove_dash');
  });

  test('detects slash removal', () => {
    const sig = computeTransformationSignature('21/3/1', '2131');
    expect(sig).toBe('remove_slash');
  });

  test('returns null for non-punctuation changes', () => {
    const sig = computeTransformationSignature('GM-8036', 'GM-8037');
    expect(sig).toBeNull();
  });

  test('handles multiple transformations', () => {
    const sig = computeTransformationSignature('A-B/C', 'ABC');
    expect(sig).toContain('remove');
  });
});

describe('compareCosts', () => {
  test('computes cost difference and similarity', () => {
    const result = compareCosts(1.80, 1.83);
    expect(result).not.toBeNull();
    expect(result!.difference).toBeCloseTo(0.03, 2);
    expect(result!.percentDifference).toBeLessThan(2);
    expect(result!.similarity).toBeGreaterThan(0.98);
    expect(result!.isClose).toBe(true);
  });

  test('identifies costs outside tolerance', () => {
    const result = compareCosts(1.00, 2.00, 5);
    expect(result).not.toBeNull();
    expect(result!.percentDifference).toBeGreaterThan(50);
    expect(result!.isClose).toBe(false);
  });

  test('handles null costs', () => {
    expect(compareCosts(null, 1.00)).toBeNull();
    expect(compareCosts(1.00, null)).toBeNull();
    expect(compareCosts(null, null)).toBeNull();
  });

  test('handles zero costs', () => {
    expect(compareCosts(0, 1.00)).toBeNull();
    expect(compareCosts(1.00, 0)).toBeNull();
  });
});

describe('detectUnitMismatch', () => {
  test('detects per-foot vs per-roll (50ft)', () => {
    const result = detectUnitMismatch(1.80, 90.00);
    expect(result.likelyMismatch).toBe(true);
    expect(result.ratio).toBeCloseTo(50, 0);
    expect(result.suggestion).toContain('per-roll');
  });

  test('detects per-unit vs per-hundred', () => {
    const result = detectUnitMismatch(0.50, 50.00);
    expect(result.likelyMismatch).toBe(true);
    expect(result.ratio).toBeCloseTo(100, 0);
  });

  test('does not flag similar costs', () => {
    const result = detectUnitMismatch(1.80, 1.85);
    expect(result.likelyMismatch).toBe(false);
  });

  test('flags large differences without specific ratio', () => {
    const result = detectUnitMismatch(1.00, 25.00);
    expect(result.likelyMismatch).toBe(true);
    expect(result.suggestion).toContain('Unknown');
  });
});
