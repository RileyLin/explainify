import { describe, it, expect, vi, beforeEach } from "vitest";
import { AnalysisError } from "@/lib/llm/analyzer";

// Mock the client module
vi.mock("@/lib/llm/client", () => ({
  invokeClaudeJSON: vi.fn(),
  extractJSON: vi.fn((text: string) => {
    const match = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (match) return match[1].trim();
    const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch) return jsonMatch[1].trim();
    return text.trim();
  }),
}));

import { invokeClaudeJSON, extractJSON } from "@/lib/llm/client";
import { analyzeContent } from "@/lib/llm/analyzer";

const mockFlowResponse = JSON.stringify({
  template: "flow-animator",
  meta: {
    title: "Test Flow",
    summary: "A test flow diagram",
    difficulty: "beginner",
    template: "flow-animator",
  },
  nodes: [
    { id: "a", label: "Node A", description: "First node" },
    { id: "b", label: "Node B", description: "Second node" },
  ],
  connections: [{ from: "a", to: "b", label: "connects" }],
  stepOrder: ["a", "b"],
});

const mockConceptResponse = JSON.stringify({
  template: "concept-builder",
  meta: {
    title: "Test Concept",
    summary: "A test concept explainer",
    difficulty: "intermediate",
    template: "concept-builder",
  },
  layers: [
    { id: "l1", title: "Layer 1", description: "First concept layer" },
  ],
});

describe("analyzeContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws AnalysisError for empty content", async () => {
    await expect(analyzeContent("", "auto")).rejects.toThrow(AnalysisError);
    await expect(analyzeContent("  ", "auto")).rejects.toThrow(AnalysisError);
  });

  it("returns validated data for valid LLM response", async () => {
    vi.mocked(invokeClaudeJSON).mockResolvedValue({
      content: mockFlowResponse,
      inputTokens: 100,
      outputTokens: 200,
      stopReason: "end_turn",
    });

    const result = await analyzeContent("Some content about flows", "flow-animator");
    expect(result.data.template).toBe("flow-animator");
    expect(result.inputTokens).toBe(100);
    expect(result.outputTokens).toBe(200);
  });

  it("retries on validation failure and succeeds", async () => {
    vi.mocked(invokeClaudeJSON)
      .mockResolvedValueOnce({
        content: '{"invalid": "json"}', // First attempt: invalid schema
        inputTokens: 50,
        outputTokens: 100,
        stopReason: "end_turn",
      })
      .mockResolvedValueOnce({
        content: mockConceptResponse, // Retry: valid
        inputTokens: 60,
        outputTokens: 150,
        stopReason: "end_turn",
      });

    const result = await analyzeContent("Neural network explanation", "concept-builder");
    expect(result.data.template).toBe("concept-builder");
    expect(result.inputTokens).toBe(110); // 50 + 60
    expect(result.outputTokens).toBe(250); // 100 + 150
    expect(vi.mocked(invokeClaudeJSON)).toHaveBeenCalledTimes(2);
  });

  it("throws RETRY_EXHAUSTED when both attempts fail validation", async () => {
    vi.mocked(invokeClaudeJSON)
      .mockResolvedValueOnce({
        content: '{"bad": "data"}',
        inputTokens: 50,
        outputTokens: 100,
        stopReason: "end_turn",
      })
      .mockResolvedValueOnce({
        content: '{"still": "bad"}',
        inputTokens: 60,
        outputTokens: 100,
        stopReason: "end_turn",
      });

    await expect(analyzeContent("content", "flow-animator")).rejects.toThrow(
      "Failed to generate valid explainer data after retry",
    );
  });
});
