import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import type { LLMProvider, LLMResponse, GenerateOptions } from "./types";

const DEFAULT_MODEL = "us.anthropic.claude-sonnet-4-6-v1";
const DEFAULT_REGION = "us-west-2";

export class BedrockProvider implements LLMProvider {
  name = "bedrock";
  private client: BedrockRuntimeClient;
  private defaultModel: string;

  constructor() {
    this.client = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || DEFAULT_REGION,
    });
    this.defaultModel = process.env.BEDROCK_MODEL_ID || DEFAULT_MODEL;
  }

  async generate(
    systemPrompt: string,
    userContent: string,
    options?: GenerateOptions,
  ): Promise<LLMResponse> {
    const model = options?.model || this.defaultModel;

    const body = JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: options?.maxTokens ?? 8192,
      temperature: options?.temperature ?? 0.3,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    });

    const command = new InvokeModelCommand({
      modelId: model,
      contentType: "application/json",
      accept: "application/json",
      body: new TextEncoder().encode(body),
    });

    const response = await this.client.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    const content =
      responseBody.content?.[0]?.type === "text"
        ? responseBody.content[0].text
        : "";

    return {
      content,
      inputTokens: responseBody.usage?.input_tokens ?? 0,
      outputTokens: responseBody.usage?.output_tokens ?? 0,
      stopReason: responseBody.stop_reason ?? "unknown",
    };
  }
}
