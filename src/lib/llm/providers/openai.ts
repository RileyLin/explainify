import OpenAI from "openai";
import type { LLMProvider, LLMResponse, GenerateOptions } from "./types";

const DEFAULT_MODEL = "gpt-4o";

export class OpenAIProvider implements LLMProvider {
  name = "openai";
  private client: OpenAI;
  private defaultModel: string;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable is not set");
    }
    this.client = new OpenAI({ apiKey });
    this.defaultModel = process.env.LLM_MODEL || DEFAULT_MODEL;
  }

  async generate(
    systemPrompt: string,
    userContent: string,
    options?: GenerateOptions,
  ): Promise<LLMResponse> {
    const model = options?.model || this.defaultModel;

    const response = await this.client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      max_tokens: options?.maxTokens ?? 8192,
      temperature: options?.temperature ?? 0.3,
      response_format: { type: "json_object" },
    });

    const choice = response.choices[0];
    const content = choice?.message?.content ?? "";

    return {
      content,
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
      stopReason: choice?.finish_reason ?? "unknown",
    };
  }
}
