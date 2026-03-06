import { describe, it, expect } from "vitest";
import { extractJSON } from "@/lib/llm/client";

describe("extractJSON", () => {
  it("extracts JSON from code fences", () => {
    const input = '```json\n{"template": "flow-animator"}\n```';
    expect(extractJSON(input)).toBe('{"template": "flow-animator"}');
  });

  it("extracts JSON from code fences without language", () => {
    const input = '```\n{"key": "value"}\n```';
    expect(extractJSON(input)).toBe('{"key": "value"}');
  });

  it("extracts bare JSON object", () => {
    const input = 'Here is the output: {"template": "concept-builder", "meta": {}}';
    const result = extractJSON(input);
    expect(result).toContain('"template": "concept-builder"');
  });

  it("extracts bare JSON array", () => {
    const input = 'Result: [1, 2, 3]';
    expect(extractJSON(input)).toBe("[1, 2, 3]");
  });

  it("returns trimmed input if no JSON found", () => {
    const input = "  just plain text  ";
    expect(extractJSON(input)).toBe("just plain text");
  });

  it("handles multi-line JSON in code fences", () => {
    const input = '```json\n{\n  "template": "flow-animator",\n  "nodes": []\n}\n```';
    const result = JSON.parse(extractJSON(input));
    expect(result.template).toBe("flow-animator");
  });
});
