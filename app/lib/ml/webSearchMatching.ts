import prisma from '../db/prisma';

export interface WebSearchResult {
  partNumber: string;
  description: string | null;
  manufacturer: string | null;
  specifications: string[];
  potentialMatches: Array<{
    partNumber: string;
    source: string;
    description: string;
    confidence: number;
  }>;
  rawSearchData: any;
}

/**
 * Perform web search for unmatched part using AI
 * This uses the OpenAI API to search for part information
 */
export async function searchPartOnWeb(
  partNumber: string,
  description?: string | null,
  lineCode?: string | null
): Promise<WebSearchResult> {
  try {
    // Build search query
    const searchQuery = buildSearchQuery(partNumber, description, lineCode);

    // Use OpenAI to search and analyze web results
    const searchResults = await performAISearch(searchQuery, partNumber);

    return searchResults;
  } catch (error) {
    console.error('Web search error:', error);
    throw new Error(`Failed to search for part: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Build optimized search query for part lookup
 */
function buildSearchQuery(
  partNumber: string,
  description?: string | null,
  lineCode?: string | null
): string {
  const parts = [partNumber];

  if (lineCode) {
    parts.push(lineCode);
  }

  if (description) {
    // Extract key terms from description
    const keyTerms = extractKeyTerms(description);
    parts.push(...keyTerms);
  }

  // Add automotive context
  parts.push('automotive', 'part');

  return parts.join(' ');
}

/**
 * Extract key terms from description
 */
function extractKeyTerms(description: string): string[] {
  // Remove common words and extract meaningful terms
  const commonWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
  ]);

  const words = description
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !commonWords.has(word));

  // Return top 5 unique terms
  return [...new Set(words)].slice(0, 5);
}

/**
 * Perform AI-powered search using OpenAI
 */
async function performAISearch(query: string, partNumber: string): Promise<WebSearchResult> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  try {
    // Use OpenAI to generate search insights
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages: [
          {
            role: 'system',
            content: `You are an automotive parts expert. Given a part number and search query, provide detailed information about the part including:
1. Full description of what the part is
2. Manufacturer name (if identifiable)
3. Technical specifications
4. Potential alternative part numbers or cross-references
5. Common applications

Format your response as JSON with the following structure:
{
  "description": "detailed description",
  "manufacturer": "manufacturer name or null",
  "specifications": ["spec1", "spec2"],
  "potentialMatches": [
    {
      "partNumber": "alternative part number",
      "source": "manufacturer or supplier",
      "description": "description",
      "confidence": 0.0-1.0
    }
  ]
}`,
          },
          {
            role: 'user',
            content: `Search for automotive part: ${query}\nPart Number: ${partNumber}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`OpenAI API error: ${error.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      throw new Error('No response from OpenAI');
    }

    // Parse JSON response
    const parsed = JSON.parse(content);

    return {
      partNumber,
      description: parsed.description || null,
      manufacturer: parsed.manufacturer || null,
      specifications: parsed.specifications || [],
      potentialMatches: parsed.potentialMatches || [],
      rawSearchData: parsed,
    };

  } catch (error) {
    console.error('AI search error:', error);
    
    // Return empty result if AI search fails
    return {
      partNumber,
      description: null,
      manufacturer: null,
      specifications: [],
      potentialMatches: [],
      rawSearchData: { error: error instanceof Error ? error.message : 'Unknown error' },
    };
  }
}

/**
 * Match unmatched parts using web search
 */
export async function matchUnmatchedPartsWithWebSearch(
  projectId: string,
  limit: number = 10
): Promise<Array<{
  arnoldItemId: string;
  searchResult: WebSearchResult;
  suggestedMatches: any[];
}>> {
  // Get unmatched parts
  const unmatchedParts = await prisma.unmatchedPart.findMany({
    where: {
      requiresManual: true,
      arnoldItem: {
        session: {
          projectId,
        },
      },
    },
    include: {
      arnoldItem: true,
    },
    take: limit,
  });

  const results = [];

  for (const unmatched of unmatchedParts) {
    const arnoldItem = unmatched.arnoldItem;

    // Try to get description from inventory report
    const description = await getArnoldDescription(arnoldItem.partNumber);
    const lineCode = extractLineCode(arnoldItem.partNumber);

    // Perform web search
    const searchResult = await searchPartOnWeb(
      arnoldItem.partNumber,
      description,
      lineCode
    );

    // Try to match potential matches against supplier catalog
    const suggestedMatches = await findMatchesFromWebSearch(
      searchResult,
      projectId
    );

    results.push({
      arnoldItemId: arnoldItem.id,
      searchResult,
      suggestedMatches,
    });

    // Update unmatched part with web search attempt
    await prisma.unmatchedPart.update({
      where: { id: unmatched.id },
      data: {
        attemptedMethods: [...new Set([...unmatched.attemptedMethods, 'web_search'])],
        lastAttemptAt: new Date(),
      },
    });
  }

  return results;
}

/**
 * Find matches in supplier catalog based on web search results
 */
async function findMatchesFromWebSearch(
  searchResult: WebSearchResult,
  projectId: string
): Promise<any[]> {
  const matches = [];

  // Get supplier catalog items for this project
  const supplierItems = await prisma.supplierCatalog.findMany({
    where: {
      session: {
        projectId,
      },
      supplierName: 'CarQuest',
    },
  });

  // Check each potential match from web search
  for (const potentialMatch of searchResult.potentialMatches) {
    const normalizedPart = potentialMatch.partNumber.toUpperCase().replace(/[^A-Z0-9]/g, '');

    // Find in supplier catalog
    const found = supplierItems.filter((item: any) => {
      const normalizedSupplier = item.partFull.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const normalizedSupplierPart = item.partNumber.toUpperCase().replace(/[^A-Z0-9]/g, '');

      return normalizedSupplier.includes(normalizedPart) || 
             normalizedPart.includes(normalizedSupplier) ||
             normalizedSupplierPart === normalizedPart;
    });

    if (found.length > 0) {
      matches.push({
        webSearchMatch: potentialMatch,
        supplierItems: found,
        confidence: potentialMatch.confidence,
      });
    }
  }

  return matches;
}

/**
 * Get Arnold item description from inventory report
 */
async function getArnoldDescription(partNumber: string): Promise<string | null> {
  const lineCode = extractLineCode(partNumber);
  const partOnly = partNumber.replace(/^[A-Z]+/, '');

  const inventoryItem = await prisma.supplierCatalog.findFirst({
    where: {
      supplierName: 'Arnold Inventory Report',
      OR: [
        { partFull: partNumber },
        { partNumber: partOnly },
        {
          AND: [
            { lineCode: lineCode || '' },
            { partNumber: partOnly },
          ],
        },
      ],
    },
  });

  return inventoryItem?.description || null;
}

/**
 * Extract line code from part number
 */
function extractLineCode(partNumber: string): string | null {
  const match = partNumber.match(/^([A-Z]+)/);
  return match ? match[1] : null;
}
