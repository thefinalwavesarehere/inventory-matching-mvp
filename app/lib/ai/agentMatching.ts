import { webSearchTool, Agent, AgentInputItem, Runner, withTrace } from "@openai/agents";

// Initialize the agent with web search capabilities
const partMatchingAgent = new Agent({
  name: "Part Matching Assistant",
  instructions: `You are a helpful assistant that specializes in matching automotive parts based on part numbers, names, and descriptions.

Your task is to help identify if two parts are the same or interchangeable by:
1. Analyzing part numbers (accounting for variations in formatting, prefixes, suffixes)
2. Comparing part names and descriptions
3. Using web search to find additional information about parts when needed
4. Providing confidence scores and reasoning for your matches

When comparing parts:
- Look for exact matches first
- Consider common variations (e.g., dashes, spaces, leading zeros)
- Check for known interchange relationships
- Search for manufacturer specifications if uncertain
- Provide clear reasoning for your conclusions

Return your response in this format:
{
  "isMatch": true/false,
  "confidence": 0.0-1.0,
  "reasoning": "Explanation of why this is or isn't a match",
  "suggestedMatch": "Part number if you found a better match",
  "additionalInfo": "Any relevant information from web search"
}`,
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
    temperature: 0.3, // Lower temperature for more consistent matching
    topP: 1,
    maxTokens: 2048,
    store: true
  }
});

interface PartMatchInput {
  arnoldPartNumber: string;
  arnoldDescription?: string;
  supplierPartNumber: string;
  supplierDescription?: string;
  supplierLineCode?: string;
}

interface PartMatchResult {
  isMatch: boolean;
  confidence: number;
  reasoning: string;
  suggestedMatch?: string;
  additionalInfo?: string;
}

/**
 * Use AI agent to determine if two parts match
 */
export async function matchPartsWithAgent(input: PartMatchInput): Promise<PartMatchResult> {
  try {
    const prompt = `Compare these two automotive parts and determine if they are the same or interchangeable:

Arnold Part:
- Part Number: ${input.arnoldPartNumber}
${input.arnoldDescription ? `- Description: ${input.arnoldDescription}` : ''}

Supplier Part (${input.supplierLineCode || 'Unknown Line'}):
- Part Number: ${input.supplierPartNumber}
${input.supplierDescription ? `- Description: ${input.supplierDescription}` : ''}

Please analyze these parts and provide your assessment in JSON format.`;

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
        workflow_id: "part_matching"
      }
    });

    const result = await withTrace("Part Matching", async () => {
      return await runner.run(partMatchingAgent, conversationHistory);
    });

    if (!result.finalOutput) {
      throw new Error("Agent did not return a result");
    }

    // Parse the agent's response
    const output = result.finalOutput;
    
    // Try to extract JSON from the response
    let parsedResult: PartMatchResult;
    try {
      // Look for JSON in the response
      const jsonMatch = output.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedResult = JSON.parse(jsonMatch[0]);
      } else {
        // Fallback: parse the text response
        parsedResult = {
          isMatch: output.toLowerCase().includes('match') && !output.toLowerCase().includes('no match'),
          confidence: 0.5,
          reasoning: output,
        };
      }
    } catch (parseError) {
      // If JSON parsing fails, create a result from the text
      parsedResult = {
        isMatch: output.toLowerCase().includes('match') && !output.toLowerCase().includes('no match'),
        confidence: 0.5,
        reasoning: output,
      };
    }

    return parsedResult;
  } catch (error) {
    console.error('Error in AI agent matching:', error);
    throw error;
  }
}

/**
 * Use AI agent to search for information about an unmatched part
 */
export async function searchPartWithAgent(
  partNumber: string,
  partName?: string,
  description?: string
): Promise<{
  found: boolean;
  suggestedMatches: Array<{
    partNumber: string;
    source: string;
    confidence: number;
    description?: string;
  }>;
  additionalInfo: string;
}> {
  try {
    const prompt = `Search for information about this automotive part:

Part Number: ${partNumber}
${partName ? `Part Name: ${partName}` : ''}
${description ? `Description: ${description}` : ''}

Please search for:
1. The exact part number and its specifications
2. Any known interchange or equivalent parts
3. Manufacturer information
4. Common applications or uses

Provide your findings in JSON format with this structure:
{
  "found": true/false,
  "suggestedMatches": [
    {
      "partNumber": "ABC123",
      "source": "Manufacturer or supplier name",
      "confidence": 0.0-1.0,
      "description": "Part description"
    }
  ],
  "additionalInfo": "Summary of what you found"
}`;

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
        workflow_id: "part_search"
      }
    });

    const result = await withTrace("Part Search", async () => {
      return await runner.run(partMatchingAgent, conversationHistory);
    });

    if (!result.finalOutput) {
      throw new Error("Agent did not return a result");
    }

    // Parse the agent's response
    const output = result.finalOutput;
    
    // Try to extract JSON from the response
    let parsedResult;
    try {
      const jsonMatch = output.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedResult = JSON.parse(jsonMatch[0]);
      } else {
        // Fallback
        parsedResult = {
          found: false,
          suggestedMatches: [],
          additionalInfo: output,
        };
      }
    } catch (parseError) {
      parsedResult = {
        found: false,
        suggestedMatches: [],
        additionalInfo: output,
      };
    }

    return parsedResult;
  } catch (error) {
    console.error('Error in AI agent search:', error);
    throw error;
  }
}

/**
 * Batch process multiple parts with AI agent
 */
export async function batchMatchPartsWithAgent(
  parts: PartMatchInput[],
  onProgress?: (completed: number, total: number) => void
): Promise<Array<PartMatchResult & { input: PartMatchInput }>> {
  const results: Array<PartMatchResult & { input: PartMatchInput }> = [];
  
  for (let i = 0; i < parts.length; i++) {
    try {
      const result = await matchPartsWithAgent(parts[i]);
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
        input: parts[i],
      });
    }
  }
  
  return results;
}
