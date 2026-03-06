export interface LLMProvider {
  name: string;
  generate(systemPrompt: string, userContent: string, options?: GenerateOptions): Promise<LLMResponse>;
}

export interface GenerateOptions {
  maxTokens?: number;
  temperature?: number;
  model?: string;
}

export interface LLMResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
  stopReason: string;
}
