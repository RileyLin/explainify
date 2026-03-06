import { invokeClaudeJSON, extractJSON } from "./client";
import { getSystemPrompt, type TemplateChoice } from "./prompts";
import { ExplainerDataSchema, type ExplainerData } from "@/lib/schemas/base";

export interface AnalyzerResult {
  data: ExplainerData;
  inputTokens: number;
  outputTokens: number;
}

export class AnalysisError extends Error {
  constructor(
    message: string,
    public readonly code: "INVALID_INPUT" | "LLM_ERROR" | "VALIDATION_ERROR" | "RETRY_EXHAUSTED",
    public readonly details?: string,
  ) {
    super(message);
    this.name = "AnalysisError";
  }
}

/**
 * Analyze content and generate a structured explainer.
 * Validates output with Zod and retries once on validation failure.
 */
export async function analyzeContent(
  content: string,
  template: TemplateChoice,
  model?: string,
): Promise<AnalyzerResult> {
  if (!content.trim()) {
    throw new AnalysisError("Content cannot be empty", "INVALID_INPUT");
  }

  const systemPrompt = getSystemPrompt(template);
  const userMessage = `Transform the following content into an interactive explainer:\n\n${content}`;

  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  // First attempt
  try {
    const response = await invokeClaudeJSON({
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      maxTokens: 8192,
      temperature: 0.3,
      model,
    });

    totalInputTokens += response.inputTokens;
    totalOutputTokens += response.outputTokens;

    const jsonStr = extractJSON(response.content);
    const parsed = JSON.parse(jsonStr);
    const validated = ExplainerDataSchema.parse(parsed);

    return {
      data: validated as ExplainerData,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
    };
  } catch (firstError) {
    // If it's an LLM/network error (not validation), throw immediately
    if (firstError instanceof AnalysisError) throw firstError;
    if (
      firstError instanceof Error &&
      !firstError.message.includes("JSON") &&
      !("issues" in firstError)
    ) {
      // Check if it's an API error
      if (firstError.name?.includes("Bedrock") || firstError.name?.includes("Credential") || firstError.name?.includes("API")) {
        throw new AnalysisError(
          `LLM API error: ${firstError.message}`,
          "LLM_ERROR",
          firstError.message,
        );
      }
    }

    // Retry once with error details
    const errorDetails =
      firstError instanceof Error ? firstError.message : String(firstError);

    try {
      const retryResponse = await invokeClaudeJSON({
        system: systemPrompt,
        messages: [
          { role: "user", content: userMessage },
          {
            role: "assistant",
            content: "I'll generate the JSON now.",
          },
          {
            role: "user",
            content: `Your previous output had a validation error: ${errorDetails}\n\nPlease output ONLY valid JSON matching the exact schema. Fix the issues and try again. Output ONLY the JSON, nothing else.`,
          },
        ],
        maxTokens: 8192,
        temperature: 0.2,
        model,
      });

      totalInputTokens += retryResponse.inputTokens;
      totalOutputTokens += retryResponse.outputTokens;

      const jsonStr = extractJSON(retryResponse.content);
      const parsed = JSON.parse(jsonStr);
      const validated = ExplainerDataSchema.parse(parsed);

      return {
        data: validated as ExplainerData,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
      };
    } catch (retryError) {
      const retryDetails =
        retryError instanceof Error ? retryError.message : String(retryError);
      throw new AnalysisError(
        "Failed to generate valid explainer data after retry",
        "RETRY_EXHAUSTED",
        `First error: ${errorDetails}\nRetry error: ${retryDetails}`,
      );
    }
  }
}
