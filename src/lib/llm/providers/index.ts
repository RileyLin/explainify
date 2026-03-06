import type { LLMProvider } from "./types";

export type { LLMProvider, LLMResponse, GenerateOptions } from "./types";

let cachedProvider: LLMProvider | null = null;

/**
 * Get an LLM provider by name.
 * Default: uses LLM_PROVIDER env var, falls back to auto-detection.
 * Auto-detection: openai (if OPENAI_API_KEY set) → bedrock (if AWS creds available).
 */
export function getProvider(name?: string): LLMProvider {
  const providerName = name || process.env.LLM_PROVIDER || "auto";

  // Return cached if same provider
  if (cachedProvider && (providerName === "auto" || cachedProvider.name === providerName)) {
    return cachedProvider;
  }

  let provider: LLMProvider;

  switch (providerName) {
    case "openai": {
      const { OpenAIProvider } = require("./openai");
      provider = new OpenAIProvider();
      break;
    }
    case "bedrock": {
      const { BedrockProvider } = require("./bedrock");
      provider = new BedrockProvider();
      break;
    }
    case "auto":
    default: {
      // Auto-detect based on available env vars
      if (process.env.OPENAI_API_KEY) {
        const { OpenAIProvider } = require("./openai");
        provider = new OpenAIProvider();
      } else {
        const { BedrockProvider } = require("./bedrock");
        provider = new BedrockProvider();
      }
      break;
    }
  }

  cachedProvider = provider;
  return provider;
}

/**
 * Clear the cached provider (useful for testing).
 */
export function clearProviderCache(): void {
  cachedProvider = null;
}
