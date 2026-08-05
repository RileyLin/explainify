import { sha256 } from "../comprehension/util.mjs";
import { hashExcerpt, hashReceipt, hashToolInput, hashToolOutput } from "../session/bundle-schema.mjs";

const excerpt = (id, kind, role, text, locator) => {
  const value = { id, kind, role, text, locator };
  return { ...value, sha256: hashExcerpt(value) };
};
const tool = (id, toolName, status, inputSummary, outputSummary, inputLocator, outputLocator) => {
  const value = { id, toolName, status, inputSummary, outputSummary, inputLocator, ...(outputSummary ? { outputLocator } : {}) };
  return {
    ...value,
    inputSha256: hashToolInput(value),
    ...(outputSummary ? { outputSha256: hashToolOutput(value) } : {}),
  };
};
const receipt = (id, kind, command, status, exitCode, scope, content, commandLocator, outputLocator) => {
  const value = { id, kind, command, status, ...(exitCode !== undefined ? { exitCode } : {}), scope, content, commandLocator, ...(outputLocator ? { outputLocator } : {}) };
  return { ...value, sha256: hashReceipt(value) };
};

export function featureFixture() {
  const objective = excerpt("goal", "user_requirement", "user", "Add a local waitlist API with structured validation and tests.", "jsonl:feature-user#content[0]");
  return {
    schemaVersion: 1,
    request: { question: "What did this coding session change, why, and how does the request flow now?", audience: { role: "technical founder", technicalDepth: "working" } },
    session: { id: "fixture-feature-waitlist", source: "claude_code", captureEvent: "fixture", cwd: "/repo/explainify", transcriptSha256: sha256("feature transcript"), startedAt: "2026-08-05T10:00:00Z", endedAt: "2026-08-05T10:20:00Z" },
    objective: { text: objective.text, sourceId: objective.id },
    excerpts: [
      objective,
      excerpt("decision", "agent_decision", "assistant", "Keep validation inside the route boundary so malformed input never reaches the persistence adapter.", "jsonl:feature-assistant#content[1]"),
      excerpt("explanation", "agent_explanation", "assistant", "The request now moves from the form to schema validation, then to the waitlist adapter, with structured 400 or 503 responses.", "jsonl:feature-assistant#content[2]"),
    ],
    toolEvents: [
      tool("inspect", "Read", "succeeded", "Inspect the existing waitlist form and API conventions.", "Found a form without a server route and existing structured error helpers.", "jsonl:tool-inspect#input", "jsonl:tool-inspect#output"),
      tool("edit", "Edit", "succeeded", "Add the waitlist route, schema, and client response handling.", "Changed the route, validation module, and waitlist component.", "jsonl:tool-edit#input", "jsonl:tool-edit#output"),
      tool("test", "Bash", "succeeded", "Run focused waitlist tests.", "8 waitlist tests passed.", "jsonl:tool-test#input", "jsonl:tool-test#output"),
    ],
    repository: { baseRevision: "1111111", headRevision: "2222222", dirty: false, changedFiles: [
      { path: "src/app/api/waitlist/route.ts", status: "added", sha256: sha256("route") },
      { path: "src/lib/waitlist-schema.ts", status: "added", sha256: sha256("schema") },
      { path: "src/components/waitlist/waitlist-capture.tsx", status: "modified", sha256: sha256("client") },
    ] },
    receipts: [receipt("waitlist-tests", "test", "npm test -- waitlist", "succeeded", 0, "waitlist", "8 tests passed", "jsonl:tool-test#input", "jsonl:tool-test#output")],
    exclusions: [{ kind: "progress_chatter", count: 6, reason: "repeated progress updates add no product evidence" }],
    privacy: { redactionCount: 1, deniedPathCount: 1, secretScan: "pass", publication: "local_only" },
  };
}

export function debuggingFixture() {
  const objective = excerpt("goal", "user_requirement", "user", "Find why the renderer test fails only after navigation and fix the actual cause.", "jsonl:debug-user#content[0]");
  return {
    schemaVersion: 1,
    request: { question: "What caused the failure, what hypothesis was rejected, and what should I review?", audience: { role: "engineering reviewer", technicalDepth: "expert" } },
    session: { id: "fixture-debug-navigation", source: "claude_code", captureEvent: "fixture", cwd: "/repo/explainify", transcriptSha256: sha256("debug transcript"), startedAt: "2026-08-05T11:00:00Z", endedAt: "2026-08-05T11:35:00Z" },
    objective: { text: objective.text, sourceId: objective.id },
    excerpts: [
      objective,
      excerpt("rejected", "agent_decision", "assistant", "The renderer itself is not the cause: the same fixture passes when navigation context is supplied.", "jsonl:debug-assistant#content[1]"),
      excerpt("cause", "agent_explanation", "assistant", "The failing test mounted a client component without the Next navigation provider required after the route transition.", "jsonl:debug-assistant#content[2]"),
      excerpt("remaining", "unresolved", "assistant", "The production browser path still needs a focused navigation smoke test.", "jsonl:debug-assistant#content[3]"),
    ],
    toolEvents: [
      tool("reproduce", "Bash", "failed", "Run the renderer test in isolation.", "The test failed with a missing router context error.", "jsonl:tool-reproduce#input", "jsonl:tool-reproduce#output"),
      tool("compare", "Bash", "succeeded", "Run the same fixture with navigation context.", "The fixture passed, rejecting renderer data as the cause.", "jsonl:tool-compare#input", "jsonl:tool-compare#output"),
      tool("fix", "Edit", "succeeded", "Wrap the test render helper with the navigation provider.", "Updated the shared test render helper.", "jsonl:tool-fix#input", "jsonl:tool-fix#output"),
    ],
    repository: { baseRevision: "3333333", headRevision: "4444444", dirty: false, changedFiles: [
      { path: "tests/renderers.test.tsx", status: "modified", sha256: sha256("test") },
      { path: "tests/setup.tsx", status: "modified", sha256: sha256("provider") },
    ] },
    receipts: [
      receipt("failing-test", "test", "npm test -- renderers", "failed", 1, "renderers", "missing router context", "jsonl:tool-reproduce#input", "jsonl:tool-reproduce#output"),
      receipt("passing-test", "test", "npm test -- renderers", "succeeded", 0, "renderers", "22 tests passed", "jsonl:tool-compare#input", "jsonl:tool-compare#output"),
    ],
    exclusions: [{ kind: "private_tool_result", count: 1, reason: "credential-shaped tool output is denied before selection" }],
    privacy: { redactionCount: 2, deniedPathCount: 1, secretScan: "pass", publication: "local_only" },
  };
}
