/**
 * Utility functions for match analysis and data processing
 */

import { Match, MatchStatistics, FilterOptions, SortField, SortDirection } from './types';

/**
 * Calculate statistics from matches
 */
export function calculateStatistics(matches: Match[]): MatchStatistics {
  if (matches.length === 0) {
    return {
      totalMatches: 0,
      highConfidence: 0,
      mediumConfidence: 0,
      lowConfidence: 0,
      unitConversions: 0,
      perfectPriceMatches: 0,
      averageConfidence: 0,
      totalValue: 0
    };
  }

  let highConfidence = 0;
  let mediumConfidence = 0;
  let lowConfidence = 0;
  let unitConversions = 0;
  let perfectPriceMatches = 0;
  let totalConfidence = 0;
  let totalValue = 0;

  matches.forEach(match => {
    // Confidence levels
    if (match.confidenceScore >= 0.9) {
      highConfidence++;
    } else if (match.confidenceScore >= 0.75) {
      mediumConfidence++;
    } else {
      lowConfidence++;
    }

    // Unit conversions
    if (match.unitConversion?.needsConversion) {
      unitConversions++;
    }

    // Perfect price matches
    if (match.unitConversion?.priceMatchPercentage && 
        match.unitConversion.priceMatchPercentage >= 95) {
      perfectPriceMatches++;
    }

    totalConfidence += match.confidenceScore;
    totalValue += match.arnoldItem.unitPrice * match.arnoldItem.quantity;
  });

  return {
    totalMatches: matches.length,
    highConfidence,
    mediumConfidence,
    lowConfidence,
    unitConversions,
    perfectPriceMatches,
    averageConfidence: totalConfidence / matches.length,
    totalValue
  };
}

/**
 * Filter matches based on criteria
 */
export function filterMatches(matches: Match[], filters: FilterOptions): Match[] {
  return matches.filter(match => {
    // Confidence range filter
    if (filters.confidenceMin !== undefined && 
        match.confidenceScore < filters.confidenceMin) {
      return false;
    }
    if (filters.confidenceMax !== undefined && 
        match.confidenceScore > filters.confidenceMax) {
      return false;
    }

    // Line code filter
    if (filters.lineCode && 
        match.arnoldItem.lineCode !== filters.lineCode) {
      return false;
    }

    // Unit conversion filter
    if (filters.unitConversion !== undefined) {
      const hasConversion = match.unitConversion?.needsConversion || false;
      if (hasConversion !== filters.unitConversion) {
        return false;
      }
    }

    // Status filter
    if (filters.status && match.status !== filters.status) {
      return false;
    }

    return true;
  });
}

/**
 * Sort matches by specified field and direction
 */
export function sortMatches(
  matches: Match[], 
  field: SortField, 
  direction: SortDirection
): Match[] {
  const sorted = [...matches].sort((a, b) => {
    let comparison = 0;

    switch (field) {
      case 'confidence':
        comparison = a.confidenceScore - b.confidenceScore;
        break;
      case 'partNumber':
        comparison = a.arnoldItem.partNumber.localeCompare(b.arnoldItem.partNumber);
        break;
      case 'price':
        comparison = a.arnoldItem.unitPrice - b.arnoldItem.unitPrice;
        break;
      case 'lineCode':
        comparison = a.arnoldItem.lineCode.localeCompare(b.arnoldItem.lineCode);
        break;
    }

    return direction === 'asc' ? comparison : -comparison;
  });

  return sorted;
}

/**
 * Export matches to CSV format
 */
export function exportToCSV(matches: Match[]): string {
  const headers = [
    'Arnold Line Code',
    'Arnold Part Number',
    'Arnold Description',
    'Arnold Unit',
    'Arnold Price',
    'Arnold Quantity',
    'Supplier ID',
    'Supplier Line Code',
    'Supplier Part Number',
    'Supplier Description',
    'Supplier Unit',
    'Supplier Price',
    'Confidence Score',
    'Unit Conversion',
    'Normalized Price',
    'Price Match %',
    'Match Reasons'
  ];

  const rows = matches.map(match => {
    const conversion = match.unitConversion;
    return [
      match.arnoldItem.lineCode,
      match.arnoldItem.partNumber,
      `"${match.arnoldItem.description}"`,
      match.arnoldItem.unitOfIssue,
      match.arnoldItem.unitPrice.toFixed(2),
      match.arnoldItem.quantity,
      match.supplierItem.supplierId,
      match.supplierItem.supplierLineCode,
      match.supplierItem.supplierPartNumber,
      `"${match.supplierItem.description}"`,
      match.supplierItem.unitOfIssue,
      match.supplierItem.unitPrice.toFixed(2),
      (match.confidenceScore * 100).toFixed(1),
      conversion?.needsConversion ? 'Yes' : 'No',
      conversion?.normalizedSupplierPrice?.toFixed(2) || 'N/A',
      conversion?.priceMatchPercentage?.toFixed(1) || 'N/A',
      `"${match.matchReasons.join('; ')}"`
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

/**
 * Get unique line codes from matches
 */
export function getUniqueLineCodes(matches: Match[]): string[] {
  const codes = new Set(matches.map(m => m.arnoldItem.lineCode));
  return Array.from(codes).sort();
}

/**
 * Group matches by confidence level
 */
export function groupByConfidence(matches: Match[]): {
  high: Match[];
  medium: Match[];
  low: Match[];
} {
  return {
    high: matches.filter(m => m.confidenceScore >= 0.9),
    medium: matches.filter(m => m.confidenceScore >= 0.75 && m.confidenceScore < 0.9),
    low: matches.filter(m => m.confidenceScore < 0.75)
  };
}

/**
 * Download file to user's computer
 */
export function downloadFile(content: string, filename: string, mimeType: string = 'text/csv') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

