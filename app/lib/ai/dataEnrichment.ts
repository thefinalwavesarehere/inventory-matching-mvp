import { webSearchTool, Agent, AgentInputItem, Runner, withTrace } from "@openai/agents";
import { withRateLimit, openaiRateLimiters } from '../utils/rateLimiter';

// AI agent for finding missing part data
const dataEnrichmentAgent = new Agent({
  name: "Part Data Enrichment Assistant",
  instructions: `You are an expert at finding missing information about automotive parts.

Your task is to find specific missing data fields for automotive parts using web search when needed.

When searching for part information:
1. Look for official manufacturer specifications
2. Check supplier catalogs and datasheets
3. Find pricing information from reliable sources
4. Identify packaging details (box size, quantity per box)
5. Verify current availability and stock information

Provide your findings in this JSON format:
{
  "found": true/false,
  "data": {
    "price": number or null,
    "cost": number or null,
    "boxSize": string or null,
    "qtyPerBox": number or null,
    "description": string or null,
    "availability": string or null,
    "manufacturer": string or null
  },
  "sources": ["source1", "source2"],
  "confidence": 0.0-1.0,
  "notes": "Additional relevant information"
}

Only include fields that you found with high confidence. Set fields to null if not found or uncertain.`,
  model: "gpt-4.1",
  tools: [
    webSearchTool({
      userLocation: {
        type: "approximate",
        country: "US",
        region: undefined,
        city: undefined,
        timezone: undefined
      },
      searchContextSize: "high"
    })
  ],
  modelSettings: {
    temperature: 0.3,
    topP: 1,
    maxTokens: 2048,
    store: true
  }
});

interface EnrichmentInput {
  partNumber: string;
  lineCode?: string;
  description?: string;
  missingFields: string[]; // e.g., ["price", "boxSize", "qtyPerBox"]
}

interface EnrichmentResult {
  found: boolean;
  data: {
    price?: number;
    cost?: number;
    boxSize?: string;
    qtyPerBox?: number;
    description?: string;
    availability?: string;
    manufacturer?: string;
  };
  sources: string[];
  confidence: number;
  notes: string;
}

/**
 * Use AI to find missing data for a part
 */
export async function enrichPartData(input: EnrichmentInput): Promise<EnrichmentResult> {
  return withRateLimit(async () => {
  try {
    const missingFieldsList = input.missingFields.join(', ');
    
    const prompt = `Find the following missing information for this automotive part:

Part Number: ${input.partNumber}
${input.lineCode ? `Line Code: ${input.lineCode}` : ''}
${input.description ? `Description: ${input.description}` : ''}

Missing Fields: ${missingFieldsList}

Please search for this part and provide the missing information in JSON format. Focus on finding accurate, up-to-date information from reliable sources.`;

    const conversationHistory: AgentInputItem[] = [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: prompt
          }
        ]
      }
    ];

    const runner = new Runner({
      traceMetadata: {
        __trace_source__: "inventory-matching-system",
        workflow_id: "data_enrichment"
      }
    });

    const result = await withTrace("Data Enrichment", async () => {
      return await runner.run(dataEnrichmentAgent, conversationHistory);
    });

    if (!result.finalOutput) {
      throw new Error("Agent did not return a result");
    }

    // Parse the agent's response
    const output = result.finalOutput;
    
    // Try to extract JSON from the response
    let parsedResult: EnrichmentResult;
    try {
      const jsonMatch = output.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedResult = JSON.parse(jsonMatch[0]);
      } else {
        // Fallback
        parsedResult = {
          found: false,
          data: {},
          sources: [],
          confidence: 0,
          notes: output,
        };
      }
    } catch (parseError) {
      parsedResult = {
        found: false,
        data: {},
        sources: [],
        confidence: 0,
        notes: output,
      };
    }

    return parsedResult;
  } catch (error) {
    console.error('Error in data enrichment:', error);
    throw error;
  }
  });
}

/**
 * Batch enrich multiple parts with rate limiting
 */
export async function batchEnrichData(
  parts: EnrichmentInput[],
  options: {
    onProgress?: (completed: number, total: number) => void;
    delayMs?: number; // Deprecated: rate limiting now handled by centralized limiter
  } = {}
): Promise<Array<EnrichmentResult & { input: EnrichmentInput }>> {
  const { onProgress } = options;
  const results: Array<EnrichmentResult & { input: EnrichmentInput }> = [];
  
  // Use centralized rate limiter for batch processing
  for (let i = 0; i < parts.length; i++) {
    try {
      const result = await enrichPartData(parts[i]);
      results.push({ ...result, input: parts[i] });
      
      if (onProgress) {
        onProgress(i + 1, parts.length);
      }
    } catch (error) {
      console.error(`Error enriching part ${parts[i].partNumber}:`, error);
      results.push({
        found: false,
        data: {},
        sources: [],
        confidence: 0,
        notes: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        input: parts[i],
      });
    }
  }
  
  return results;
}

/**
 * Identify which fields are missing from a part record
 */
export function identifyMissingFields(part: any): string[] {
  const missingFields: string[] = [];
  
  // Check common fields
  if (!part.cost && !part.price) missingFields.push('price');
  if (!part.boxSize) missingFields.push('boxSize');
  if (!part.qtyPerBox) missingFields.push('qtyPerBox');
  if (!part.description) missingFields.push('description');
  if (!part.qtyAvail && !part.availability) missingFields.push('availability');
  
  return missingFields;
}
