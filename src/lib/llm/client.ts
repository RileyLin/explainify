import { getProvider, type LLMResponse, type GenerateOptions } from "./providers";

export type { LLMResponse, GenerateOptions };

// Re-export for backward compatibility
export interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ClaudeRequest {
  system: string;
  messages: ClaudeMessage[];
  maxTokens?: number;
  temperature?: number;
  model?: string;
}

export type ClaudeResponse = LLMResponse;

/**
 * Invoke the configured LLM provider with a JSON generation request.
 * Supports multi-turn messages by concatenating them for the provider.
 */
export async function invokeClaudeJSON(request: ClaudeRequest): Promise<ClaudeResponse> {
  const provider = getProvider();

  // For multi-turn messages (retry flow), concatenate into a single user message
  const userContent = request.messages.length === 1
    ? request.messages[0].content
    : request.messages.map((m) => `[${m.role}]: ${m.content}`).join("\n\n");

  return provider.generate(request.system, userContent, {
    maxTokens: request.maxTokens,
    temperature: request.temperature,
    model: request.model,
  });
}

/**
 * Generate content using the LLM provider directly.
 * Simpler API than invokeClaudeJSON — for new code.
 */
export async function generateJSON(
  systemPrompt: string,
  userContent: string,
  options?: GenerateOptions,
): Promise<LLMResponse> {
  const provider = getProvider();
  return provider.generate(systemPrompt, userContent, options);
}

/**
 * Extract JSON from an LLM response that may contain markdown code fences.
 */
export function extractJSON(text: string): string {
  // Try to find JSON in code fences first
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }
  // Otherwise try to find a top-level JSON object or array
  const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) {
    return jsonMatch[1].trim();
  }
  return text.trim();
}
