import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_MODEL } from "@/lib/llm/providers/bedrock";

// Regression guard for the release-gate defect: the default Bedrock model ID
// was `us.anthropic.claude-sonnet-4-6-v1`, which Bedrock rejects with HTTP 400
// "The provided model identifier is invalid." The valid cross-region
// inference-profile ID is `us.anthropic.claude-sonnet-4-6` (no version suffix).
describe("Bedrock default model ID", () => {
  it("is the valid cross-region inference-profile ID", () => {
    expect(DEFAULT_MODEL).toBe("us.anthropic.claude-sonnet-4-6");
  });

  it("does not carry a fabricated version suffix", () => {
    // A trailing `-v<n>` is exactly the shape that produced the 400.
    expect(DEFAULT_MODEL).not.toMatch(/-v\d+$/);
  });

  it("matches the region-prefixed anthropic inference-profile shape", () => {
    expect(DEFAULT_MODEL).toMatch(/^[a-z]{2}\.anthropic\.[a-z0-9-]+$/);
  });
});

describe("BedrockProvider default model resolution", () => {
  const original = process.env.BEDROCK_MODEL_ID;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.BEDROCK_MODEL_ID;
    } else {
      process.env.BEDROCK_MODEL_ID = original;
    }
    vi.resetModules();
  });

  it("falls back to the valid default when BEDROCK_MODEL_ID is unset", async () => {
    delete process.env.BEDROCK_MODEL_ID;
    vi.resetModules();
    const { BedrockProvider } = await import("@/lib/llm/providers/bedrock");
    const provider = new BedrockProvider();
    expect(
      (provider as unknown as { defaultModel: string }).defaultModel,
    ).toBe("us.anthropic.claude-sonnet-4-6");
  });

  it("honors an explicit BEDROCK_MODEL_ID override", async () => {
    process.env.BEDROCK_MODEL_ID = "us.anthropic.claude-opus-4-6";
    vi.resetModules();
    const { BedrockProvider } = await import("@/lib/llm/providers/bedrock");
    const provider = new BedrockProvider();
    expect(
      (provider as unknown as { defaultModel: string }).defaultModel,
    ).toBe("us.anthropic.claude-opus-4-6");
  });
});
