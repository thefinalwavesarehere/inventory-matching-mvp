import { Agent, AgentInputItem, Runner, withTrace } from "@openai/agents";
import { withRateLimit, openaiRateLimiters } from '../utils/rateLimiter';

// AI agent for semantic matching WITHOUT web search
// This is used as a pre-step before web search
const semanticMatchingAgent = new Agent({
  name: "Semantic Part Matching Assistant",
  instructions: `You are an expert at matching automotive parts based on part numbers, names, and descriptions.

Your task is to analyze two parts and determine if they are the same or interchangeable using ONLY the information provided - DO NOT use web search.

When comparing parts:
1. Analyze part number similarities (accounting for formatting variations, prefixes, suffixes, dashes, spaces)
2. Compare part names for semantic similarity
3. Evaluate descriptions for matching functionality and specifications
4. Consider common automotive part naming conventions
5. Look for manufacturer codes and line codes

Provide your assessment in this JSON format:
{
  "isMatch": true/false,
  "confidence": 0.0-1.0,
  "reasoning": "Detailed explanation of your analysis",
  "partNumberSimilarity": 0.0-1.0,
  "nameSimilarity": 0.0-1.0,
  "descriptionSimilarity": 0.0-1.0
}

Confidence scoring guide:
- 0.9-1.0: Very high confidence (exact match or known interchange)
- 0.7-0.89: High confidence (strong similarities across multiple fields)
- 0.5-0.69: Medium confidence (some similarities, but uncertain)
- 0.3-0.49: Low confidence (weak similarities)
- 0.0-0.29: Very low confidence (likely not a match)`,
  model: "gpt-4.1",
  tools: [], // NO web search tool - semantic analysis only
  modelSettings: {
    temperature: 0.2, // Low temperature for consistent matching
    topP: 1,
    maxTokens: 1024,
    store: true
  }
});

interface SemanticMatchInput {
  arnoldPartNumber: string;
  arnoldDescription?: string;
  supplierPartNumber: string;
  supplierDescription?: string;
  supplierLineCode?: string;
}

interface SemanticMatchResult {
  isMatch: boolean;
  confidence: number;
  reasoning: string;
  partNumberSimilarity: number;
  nameSimilarity: number;
  descriptionSimilarity: number;
}

/**
 * Use AI semantic analysis to match parts WITHOUT web search
 * This is faster and cheaper than web search, and should be used first
 */
export async function matchPartsSemanticOnly(input: SemanticMatchInput): Promise<SemanticMatchResult> {
  return withRateLimit(async () => {
  try {
    const prompt = `Compare these two automotive parts using semantic analysis only:

Arnold Part:
- Part Number: ${input.arnoldPartNumber}
${input.arnoldDescription ? `- Description: ${input.arnoldDescription}` : '- Description: Not available'}

Supplier Part (${input.supplierLineCode || 'Unknown Line'}):
- Part Number: ${input.supplierPartNumber}
${input.supplierDescription ? `- Description: ${input.supplierDescription}` : '- Description: Not available'}

Analyze these parts and provide your assessment in JSON format. Use ONLY the information provided - do not search for additional information.`;

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
        workflow_id: "semantic_matching"
      }
    });

    const result = await withTrace("Semantic Matching", async () => {
      return await runner.run(semanticMatchingAgent, conversationHistory);
    });

    if (!result.finalOutput) {
      throw new Error("Agent did not return a result");
    }

    // Parse the agent's response
    const output = result.finalOutput;
    
    // Try to extract JSON from the response
    let parsedResult: SemanticMatchResult;
    try {
      const jsonMatch = output.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedResult = JSON.parse(jsonMatch[0]);
      } else {
        // Fallback: parse the text response
        parsedResult = {
          isMatch: output.toLowerCase().includes('match') && !output.toLowerCase().includes('no match'),
          confidence: 0.5,
          reasoning: output,
          partNumberSimilarity: 0.5,
          nameSimilarity: 0.5,
          descriptionSimilarity: 0.5,
        };
      }
    } catch (parseError) {
      // If JSON parsing fails, create a result from the text
      parsedResult = {
        isMatch: output.toLowerCase().includes('match') && !output.toLowerCase().includes('no match'),
        confidence: 0.5,
        reasoning: output,
        partNumberSimilarity: 0.5,
        nameSimilarity: 0.5,
        descriptionSimilarity: 0.5,
      };
    }

    return parsedResult;
  } catch (error) {
    console.error('Error in semantic matching:', error);
    throw error;
  }
  });
}

/**
 * Batch process multiple parts with semantic matching
 * Includes rate limiting to respect OpenAI API limits
 */
export async function batchSemanticMatch(
  parts: SemanticMatchInput[],
  options: {
    onProgress?: (completed: number, total: number) => void;
    delayMs?: number; // Deprecated: rate limiting now handled by centralized limiter
  } = {}
): Promise<Array<SemanticMatchResult & { input: SemanticMatchInput }>> {
  const { onProgress } = options;
  const results: Array<SemanticMatchResult & { input: SemanticMatchInput }> = [];
  
  // Use centralized rate limiter for batch processing
  for (let i = 0; i < parts.length; i++) {
    try {
      const result = await matchPartsSemanticOnly(parts[i]);
      results.push({ ...result, input: parts[i] });
      
      if (onProgress) {
        onProgress(i + 1, parts.length);
      }
    } catch (error) {
      console.error(`Error matching part ${parts[i].arnoldPartNumber}:`, error);
      results.push({
        isMatch: false,
        confidence: 0,
        reasoning: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        partNumberSimilarity: 0,
        nameSimilarity: 0,
        descriptionSimilarity: 0,
        input: parts[i],
      });
    }
  }
  
  return results;
}
