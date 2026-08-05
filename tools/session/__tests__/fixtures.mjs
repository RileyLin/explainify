// Deterministic transcript fixtures for the Phase 1A adapter tests. These are
// small, hand-written JSONL transcripts (as text) exercising each selection and
// safety path. They are the "immutable transcript" half of the determinism
// gate; the repository half is passed explicitly so tests never touch git.

// S1-shaped: one session that adds a bounded feature, makes a decision, runs a
// test. Includes a thinking block (must be excluded), an unknown tool (excluded),
// a denied-path Read (excluded), and a secret-bearing tool output (redacted).
export const FEATURE_CHANGE_JSONL = [
  {
    type: "user",
    uuid: "u1",
    message: { role: "user", content: [{ type: "text", text: "Add a rate limiter to the API gateway and cover it with a unit test." }] },
  },
  {
    type: "assistant",
    uuid: "a1",
    message: {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "internal reasoning that must never be captured" },
        { type: "text", text: "I will use a token-bucket approach because it bounds burst traffic better than a fixed window." },
      ],
    },
  },
  {
    type: "assistant",
    uuid: "a2",
    message: {
      role: "assistant",
      content: [
        { type: "tool_use", id: "t1", name: "Write", input: { file_path: "src/gateway/rate-limiter.ts", content: "export const limiter = tokenBucket(100);" } },
      ],
    },
  },
  {
    type: "user",
    uuid: "u2",
    message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", is_error: false, content: "File written." }] },
  },
  {
    type: "assistant",
    uuid: "a3",
    message: {
      role: "assistant",
      content: [
        { type: "tool_use", id: "t2", name: "Read", input: { file_path: "/home/app/.env" } },
      ],
    },
  },
  {
    type: "assistant",
    uuid: "a4",
    message: {
      role: "assistant",
      content: [
        { type: "tool_use", id: "t3", name: "ToolSearch", input: { query: "unknown tool payload" } },
      ],
    },
  },
  {
    type: "assistant",
    uuid: "a5",
    message: {
      role: "assistant",
      content: [
        { type: "tool_use", id: "t4", name: "Bash", input: { command: "npm test rate-limiter", description: "run the new unit test" } },
      ],
    },
  },
  {
    type: "user",
    uuid: "u3",
    message: {
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: "t4", is_error: false, content: "1 passed. Also printed token=ghp_ABCDEFGHIJKLMNOPQRST12345 during setup." },
      ],
    },
  },
  {
    type: "assistant",
    uuid: "a6",
    message: { role: "assistant", content: [{ type: "text", text: "The test passes. One unresolved item: still need to wire the limiter into the middleware chain." }] },
  },
].map((r) => JSON.stringify(r)).join("\n") + "\n";

// A transcript whose ONLY user text carries an assigned secret, to prove the
// objective/excerpt secret gate redacts rather than leaks.
export const SECRET_IN_TEXT_JSONL = [
  {
    type: "user",
    uuid: "s1",
    message: { role: "user", content: [{ type: "text", text: "Deploy using api_key=SUPER_SECRET_VALUE_1234567890 to the staging box." }] },
  },
].map((r) => JSON.stringify(r)).join("\n") + "\n";

// Malformed + noise lines to prove fail-closed parsing/exclusion.
export const NOISY_JSONL =
  '{"type":"queue-operation","operation":"x"}\n' +
  "this is not json at all\n" +
  '{"type":"assistant","uuid":"n1","message":{"role":"assistant","content":[{"type":"image","source":{}}]}}\n' +
  '{"type":"user","uuid":"n2","message":{"role":"user","content":[{"type":"text","text":"A real requirement line that is long enough to keep."}]}}\n';

export const FIXED_REPOSITORY = {
  baseRevision: "1111111111111111111111111111111111111111",
  headRevision: "2222222222222222222222222222222222222222",
  dirty: false,
  changedFiles: [
    { path: "src/gateway/rate-limiter.ts", status: "added", sha256: "a".repeat(64) },
    { path: ".env.local", status: "modified" },
  ],
};
