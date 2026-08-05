// Phase 1A adapter + schema + safety tests. Run with node's built-in runner:
//   node --test tools/session/__tests__/*.test.mjs
// Deterministic: no git, no network, no live transcript — fixtures only.

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { buildBundleFromTranscript } from "../claude-adapter.mjs";
import { validateBundle } from "../bundle-schema.mjs";
import { isDeniedPath, redact, scanClean, REDACTION_PLACEHOLDER } from "../safety.mjs";
import { FEATURE_CHANGE_JSONL, SECRET_IN_TEXT_JSONL, NOISY_JSONL, FIXED_REPOSITORY } from "./fixtures.mjs";

const sha256 = (v) => createHash("sha256").update(v).digest("hex");

function buildFeature(overrides = {}) {
  return buildBundleFromTranscript({
    transcript: FEATURE_CHANGE_JSONL,
    transcriptSha256: sha256(FEATURE_CHANGE_JSONL),
    session: { id: "sess-1", cwd: "/repo", captureEvent: "stop" },
    repository: FIXED_REPOSITORY,
    receipts: [],
    ...overrides,
  }).bundle;
}

test("produces a schema-valid bundle from a real-shaped transcript", () => {
  const bundle = buildFeature();
  const { ok, errors } = validateBundle(bundle);
  assert.equal(ok, true, errors.join("; "));
  assert.equal(bundle.schemaVersion, 1);
  assert.equal(bundle.session.source, "claude_code");
  assert.equal(bundle.privacy.publication, "local_only");
  assert.equal(bundle.privacy.secretScan, "pass");
});

test("captures the human requirement as the objective with a resolvable locator", () => {
  const bundle = buildFeature();
  assert.match(bundle.objective.text, /rate limiter/i);
  const src = bundle.excerpts.find((e) => e.id === bundle.objective.sourceId);
  assert.ok(src, "objective sourceId resolves to an excerpt");
  assert.equal(src.role, "user");
  assert.equal(src.kind, "user_requirement");
  assert.match(src.locator, /^jsonl:u1#content\[0\]$/);
});

test("excludes model reasoning (thinking blocks) entirely", () => {
  const bundle = buildFeature();
  const all = JSON.stringify(bundle);
  assert.ok(!all.includes("internal reasoning"), "thinking content must not appear");
  const ex = bundle.exclusions.find((x) => x.kind === "model_reasoning");
  assert.ok(ex && ex.count >= 1);
});

test("keeps change/inspect tool events and pairs their results by tool_use_id", () => {
  const bundle = buildFeature();
  const write = bundle.toolEvents.find((t) => t.toolName === "Write");
  assert.ok(write, "Write tool kept");
  assert.equal(write.status, "succeeded");
  assert.match(write.outputSummary, /File written/);
  const bash = bundle.toolEvents.find((t) => t.toolName === "Bash");
  assert.ok(bash, "Bash tool kept");
});

test("tool events carry distinct input and output locators (output never borrows input)", () => {
  const bundle = buildFeature();
  const write = bundle.toolEvents.find((t) => t.toolName === "Write");
  assert.match(write.inputLocator, /^jsonl:a2#content\[0\]$/);
  assert.match(write.outputLocator, /^jsonl:u2#content\[0\]$/);
  assert.notEqual(write.inputLocator, write.outputLocator);
  assert.match(write.inputSha256, /^[0-9a-f]{64}$/);
  assert.match(write.outputSha256, /^[0-9a-f]{64}$/);
});

test("derives an honest test receipt from the Bash test command", () => {
  const bundle = buildFeature();
  const rc = bundle.receipts.find((r) => r.kind === "test");
  assert.ok(rc, "test receipt derived from `npm test`");
  assert.equal(rc.status, "succeeded"); // tool_result was is_error:false
  assert.equal(rc.exitCode, undefined, "no exit code is fabricated");
  assert.match(rc.commandLocator, /^jsonl:a5#content\[0\]$/);
  assert.match(rc.sha256, /^[0-9a-f]{64}$/);
});

test("derives a test receipt from a direct test-file run (node x.test.js), not just `npm test`", () => {
  // Regression for a real S2 debugging-dogfood gap: a session that reproduces a
  // bug by running its test directly (`node paginate.test.js`) — fail, fix,
  // re-run to pass — must still surface a verification receipt with the
  // failed→passed transition. The classifier previously only matched package
  // scripts / named runners, so the artifact's Verification panel read
  // "No verification receipt captured" despite a genuine test transition.
  const jsonl = [
    { type: "user", uuid: "u1", message: { role: "user", content: [{ type: "text", text: "Run node paginate.test.js first to reproduce the failure, then fix it." }] } },
    { type: "assistant", uuid: "a1", message: { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "Bash", input: { command: "node paginate.test.js" } }] } },
    { type: "user", uuid: "u2", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", is_error: true, content: "AssertionError: expected [1,2] got [3,4]" }] } },
    { type: "assistant", uuid: "a2", message: { role: "assistant", content: [{ type: "tool_use", id: "t2", name: "Edit", input: { file_path: "paginate.js", old_string: "page * pageSize", new_string: "(page - 1) * pageSize" } }] } },
    { type: "user", uuid: "u3", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t2", content: "updated" }] } },
    { type: "assistant", uuid: "a3", message: { role: "assistant", content: [{ type: "tool_use", id: "t3", name: "Bash", input: { command: "node paginate.test.js" } }] } },
    { type: "user", uuid: "u4", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t3", is_error: false, content: "All tests passed." }] } },
  ].map((r) => JSON.stringify(r)).join("\n") + "\n";
  const bundle = buildBundleFromTranscript({
    transcript: jsonl,
    transcriptSha256: sha256(jsonl),
    session: { id: "sess-dbg", cwd: "/repo", captureEvent: "stop" },
    repository: { dirty: false, changedFiles: [] },
  }).bundle;
  const tests = bundle.receipts.filter((r) => r.kind === "test");
  assert.equal(tests.length, 2, "both the failing and the passing test run are receipts");
  assert.deepEqual(tests.map((r) => r.status), ["failed", "succeeded"], "the failed→passed transition is preserved");
  // A non-test bare `node` invocation must still NOT be classified as a test.
  const notTest = buildBundleFromTranscript({
    transcript: [
      { type: "user", uuid: "u1", message: { role: "user", content: [{ type: "text", text: "Start the dev server so I can look at it." }] } },
      { type: "assistant", uuid: "a1", message: { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "Bash", input: { command: "node server.js" } }] } },
      { type: "user", uuid: "u2", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "listening on :3000" }] } },
    ].map((r) => JSON.stringify(r)).join("\n") + "\n",
    transcriptSha256: sha256("x"),
    session: { id: "sess-run", cwd: "/repo", captureEvent: "stop" },
    repository: { dirty: false, changedFiles: [] },
  }).bundle;
  assert.equal(notTest.receipts.filter((r) => r.kind === "test").length, 0, "a plain `node server.js` is not a test receipt");
});

// --- verification-laundering regressions (PM + Codex REVISE on f71b0f2) ---
// The classifier must key on what a command actually EXECUTES, never on a
// word/filename merely appearing in the line, and must not inherit a masked exit
// status. Helper: build a one-Bash-command session and return its receipts.
function receiptsForCommand(command, { isError = false, output = "ok" } = {}) {
  const jsonl = [
    { type: "user", uuid: "u1", message: { role: "user", content: [{ type: "text", text: "Please run the verification for this change." }] } },
    { type: "assistant", uuid: "a1", message: { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "Bash", input: { command } }] } },
    { type: "user", uuid: "u2", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", is_error: isError, content: output }] } },
  ].map((r) => JSON.stringify(r)).join("\n") + "\n";
  return buildBundleFromTranscript({
    transcript: jsonl,
    transcriptSha256: sha256(jsonl),
    session: { id: "sess-cmd", cwd: "/repo", captureEvent: "stop" },
    repository: { dirty: false, changedFiles: [] },
  }).bundle.receipts;
}

test("reading/copying/deleting a test file mints NO receipt (verification-laundering negatives)", () => {
  // The exploit: `cat paginate.test.js` minted kind:test, status:succeeded even
  // though nothing ran. Reads/copies/deletes execute no test — no receipt.
  for (const command of [
    "cat paginate.test.js",
    "sed -n '1,20p' paginate.test.js",
    "cp paginate.test.js backup.test.js",
    "rm foo_test.py",
    "sed -i 's/x/y/' api_test.py",
    "cat foo.spec.ts",
    "grep -n assert paginate.test.js",
    "less server.test.js",
    "head -5 build.log",
    "ls -la src/*.test.js",
  ]) {
    assert.equal(receiptsForCommand(command).length, 0, `no receipt for non-executing command: ${command}`);
  }
});

test("naming a runner/package script/lint/build word without executing it mints NO receipt", () => {
  // Anchor the ENTIRE classifier, not just the filename branch (PM probe): a
  // runner/script/lint/build word echoed or logged is not an execution.
  for (const command of [
    "echo npm test",
    "printf vitest",
    "sed -n 1p pytest.log",
    "cat build.log",
    "echo lint",
    "echo 'run npm run build to ship'",
    "grep eslint .github/workflows/ci.yml",
    "cat > notes.txt <<EOF\nremember to run jest\nEOF",
    "# npm test",
  ]) {
    assert.equal(receiptsForCommand(command).length, 0, `no receipt for non-executing mention: ${command}`);
  }
});

test("a separator INSIDE QUOTES is literal data, not an executed segment (quote-aware split negatives)", () => {
  // PM probe (msg 512aeba1): the segment splitter was not quote-aware, so
  // `echo "harmless; node quoted.test.js"` split at the quoted `;` and the runner
  // text leaked into a phantom executed segment that minted test:succeeded — a
  // pure fabrication (echo runs nothing). A quoted `|`/`;`/`&&`/`||` is a byte of
  // an argument, never a shell operator, so the whole thing is one `echo`/`printf`
  // segment and mints NO receipt.
  for (const command of [
    'echo "harmless; node quoted.test.js"',
    "printf 'safe | npm test'",
    'echo "run && npm run build"',
    "echo 'pytest -q || true'",
    'printf "%s\\n" "vitest run; done"',
    "echo \"a; b\" && echo 'c | d'",
  ]) {
    assert.equal(receiptsForCommand(command).length, 0, `quoted separator must not mint a receipt: ${command}`);
  }
  // Guard the other side: an ACTUAL operator outside quotes after a quoted arg is
  // still honored — `echo "x" && node paginate.test.js` really runs the test.
  const real = receiptsForCommand('echo "starting tests" && node paginate.test.js', { isError: false });
  assert.equal(real.length, 1, "an unquoted operator after a quoted arg still splits");
  assert.equal(real[0].kind, "test");
  assert.equal(real[0].status, "succeeded");
});

test("a runtime in a NON-RUN mode (eval/print/check/compile/syntax) mints NO receipt", () => {
  // Codex probe (msg a989a932): the runtime branch confirmed only that a test
  // filename appeared somewhere after a runtime head — not that the runtime
  // EXECUTED it as a test. eval/print/check/compile/format/build modes run the
  // tool but no test, so they must mint nothing (a test filename inside a quoted
  // -e/-p program is a string argument, never an executed target).
  for (const command of [
    'node -e "console.log(\'paginate.test.js\')"',
    "node --check paginate.test.js",
    'node -p "require.resolve(\'paginate.test.js\')"',
    "python -c \"print('api_test.py')\"",
    "python -m py_compile api_test.py",
    "ruby -c foo_spec.rb",
    "deno fmt foo.test.ts",
    "bun build foo.test.ts",
  ]) {
    assert.equal(receiptsForCommand(command).length, 0, `non-run mode must mint no receipt: ${command}`);
  }
});

test("command substitution and heredocs mint NO receipt (ambiguous shell form)", () => {
  // Codex parser-boundary probe (msg a989a932): `echo `printf safe; npm test``
  // laundered a success (outer echo masks nested status) and a `npm test` inside a
  // heredoc fabricated that a test ran. When what actually executes is ambiguous
  // (command substitution or a heredoc), emit nothing — data is not execution.
  for (const command of [
    "echo `printf safe; npm test`",
    "echo `npm test`",
    "result=$(npm test)",
    "echo $(node paginate.test.js)",
    "cat <<'EOF'\nnpm test\nEOF",
    "cat <<EOF\nrun jest here\nEOF",
  ]) {
    assert.equal(receiptsForCommand(command).length, 0, `ambiguous shell form must mint no receipt: ${command}`);
  }
});

test("a shell comment is data, not execution (commented-out runner mints NO receipt)", () => {
  // PM probe (msg f495ce56): top-level comments were not recognized, so
  // `echo safe # ; npm test` split at the commented-out `;` and the runner text
  // leaked into a phantom executed segment. An unquoted `#` at a word start
  // begins a comment to end-of-line — the runner after it never runs.
  for (const command of [
    "echo safe # ; npm test",
    "echo safe # | vitest",
    "true # && node paginate.test.js",
    "ls # pytest -q",
    "# npm run build",
    "echo done   #node foo.test.js",
  ]) {
    assert.equal(receiptsForCommand(command).length, 0, `commented-out runner must mint no receipt: ${command}`);
  }
  // Guard the other side: a `#` INSIDE quotes or mid-word is a literal char, not a
  // comment — a real runner after a quoted `#` still runs.
  const quotedHash = receiptsForCommand('echo "a # b" && node paginate.test.js', { isError: false });
  assert.equal(quotedHash.length, 1, "a quoted # is literal; the real run after && still counts");
  assert.equal(quotedHash[0].kind, "test");
  assert.equal(quotedHash[0].status, "succeeded");
});

test("informational / dry-run modes mint NO receipt across all kinds", () => {
  // Codex probe (msg 7a750a0e): an executable head can still be a help/version/
  // config-dump/collect-only/dry-run mode — the tool started but performed NO
  // verification. Evidence of verification PERFORMED is required, not merely that
  // a verification-capable binary ran.
  for (const command of [
    "vitest --help",
    "jest --version",
    "pytest --collect-only",
    "eslint --version",
    "eslint --print-config foo.js",
    "tsc --version",
    "tsc --showConfig",
    "webpack --help",
    "make --version",
    "make -n",
    "go test -h",
    "cargo test --help",
  ]) {
    assert.equal(receiptsForCommand(command).length, 0, `informational/dry-run mode must mint no receipt: ${command}`);
  }
});

test("attached/equal option forms and collect/list/no-run aliases mint NO receipt", () => {
  // PM probe (msg 3a578c4d): head anchoring + a whitespace-delimited no-run set
  // still missed two shapes. (1) Attached/equal value forms hide the flag from an
  // exact-token check: `node -e"…"`/`--eval="…"`/`-p"…"`/`--print="…"` and
  // `python -c"…"` run an inline program, not a test. (2) Common collect/list/
  // no-run aliases start the tool but perform no verification: `cargo test
  // --no-run`, `vitest list`, `jest --listTests`, `pytest --co`, `make
  // --just-print`. Normalize the option name and reject these before freeze.
  for (const command of [
    'node -e"console.log(\'paginate.test.js\')"',
    'node --eval="require(\'./paginate.test.js\')"',
    'node -p"require.resolve(\'paginate.test.js\')"',
    'node --print="1" paginate.test.js',
    'python -c"import api_test" api_test.py',
    "python -mpy_compile api_test.py",
    "cargo test --no-run",
    "vitest list",
    "jest --listTests",
    "pytest --co",
    "make --just-print",
  ]) {
    assert.equal(receiptsForCommand(command).length, 0, `no-run/collect/list form must mint no receipt: ${command}`);
  }
  // Guard the positive side of the -m normalization: an attached `-mpytest` is
  // still a real test run (only py_compile and inline -c are rejected).
  const real = receiptsForCommand("python -mpytest", { isError: false });
  assert.equal(real.length, 1, "attached -mpytest is still a real test run");
  assert.equal(real[0].kind, "test");
});

test("STRICT POSITIVE run grammar: only a recognized real-execution form mints; unknown modes mint nothing (not a denylist)", () => {
  // PM + Codex REVISE on 7259a9f (msg b584356f / f13c6e9d): the prior round was
  // still `recognized binary MINUS a denylist of no-run flags = verification`, so
  // every new no-run mode a binary accepts by default slipped through. The fix is
  // a strict POSITIVE grammar per binary — mint ONLY on a recognized run form;
  // reject every unrecognized flag, subcommand, and `--` passthrough carrying
  // tokens. False negatives are explicitly preferred this phase.
  const negatives = [
    // Codex b584356f — modes the binary accepts by default but run no verification.
    "go test -c", // compiles a test binary, runs nothing
    "mocha --dry-run",
    "webpack configtest", // validates config, builds nothing
    "webpack --configtest webpack.config.js",
    "cargo test -- --list", // passthrough list mode
    "make -p", // print database, runs no recipe
    "make --print-data-base",
    "npm test -- --listTests", // passthrough list mode
    // PM f13c6e9d — extended across module wrappers, linters, build tools.
    "python -m pytest --fixtures", // runner arg after `-m pytest` is a no-run mode
    "python -mpytest --collect-only",
    "rspec --dry-run",
    "phpunit --list-tests",
    "biome version", // bare-word non-run subcommand
    "golangci-lint linters", // lists linters, lints nothing
    "flake8 --bug-report",
    "pylint --generate-rcfile",
    "tslint --init",
    "webpack help", // bare-word non-run subcommand
    "tsc --build --clean", // clean, not compile
    "tsc --build --dry",
    "make -np", // bundled short cluster carrying -n (just-print)
  ];
  for (const command of negatives) {
    assert.equal(receiptsForCommand(command).length, 0, `unknown/no-run mode must mint no receipt: ${command}`);
  }
  // Positive side: the real run forms of the SAME binaries must still mint — the
  // strict grammar must not over-reject a genuine verification.
  for (const [command, kind] of [
    ["go test -run TestFoo ./pkg", "test"],
    ["go test ./...", "test"],
    ["go build ./...", "build"],
    ["make", "build"],
    ["make build", "build"],
    ["make -j4", "build"], // parallel jobs is a real recipe run
    ["make -kj4 all", "build"], // bundled run-safe short cluster
    ["tsc --noEmit", "build"],
    ["tsc --build", "build"], // a real project build (only --clean/--dry are no-run)
    ["eslint src/", "lint"],
    ["pytest -q", "test"],
    ["python -m pytest tests/", "test"],
    ["python -mpytest", "test"],
    ["rspec spec/", "test"],
    ["phpunit tests/", "test"],
    ["mocha test/", "test"],
    ["biome check", "lint"],
    ["golangci-lint run", "lint"],
    ["webpack --mode production", "build"],
    ["cargo build", "build"],
    ["cargo clippy", "lint"],
    ["npm test", "test"],
    ["npm run test", "test"],
    ["npm test rate-limiter", "test"], // a positional test-name filter is a real run
    ["deno test --allow-read", "test"],
  ]) {
    const rcs = receiptsForCommand(command, { isError: false });
    assert.equal(rcs.length, 1, `real verification run still mints: ${command}`);
    assert.equal(rcs[0].kind, kind, `kind ${kind} for: ${command}`);
    assert.equal(rcs[0].status, "succeeded", `observed succeeded status for: ${command}`);
  }
});

test("implementation-level: an UNKNOWN mode for each supported binary returns null (no mint-by-default fallback)", () => {
  // The trust-boundary invariant Codex/PM required proving directly (msg b584356f
  // / f13c6e9d): for every supported binary, an invented/unrecognized subcommand or
  // flag must mint NOTHING. This asserts the grammar is positive (allowlist), not a
  // binary-minus-denylist. If a future edit reintroduces a mint-by-default branch,
  // this fails even before a specific real-world no-run mode is discovered.
  const unknownModes = [
    "vitest --totally-made-up-flag",
    "jest --invented-mode",
    "pytest --no-such-option",
    "mocha --fictional",
    "rspec --unknownflag",
    "phpunit --nope",
    "eslint --imaginary-flag",
    "tslint --fake",
    "flake8 --does-not-exist",
    "pylint --unheard-of",
    "tsc --unknownflag",
    "webpack --fabricated",
    "rollup --nonexistent",
    "esbuild --madeup",
    "make --invented-long-flag",
    "make -Z", // unknown short flag
    "go test -unknownflag",
    "go build -unknownflag",
    "cargo test --invented",
    "cargo build --nope",
    "cargo clippy --fictional",
    "deno test --invented-permission",
    "bun test --unknownflag",
    "npm run frobnicate", // not a verification script name
    "biome frobnicate", // unknown subcommand
    "golangci-lint frobnicate",
    "ruff frobnicate",
    "vite frobnicate",
  ];
  for (const command of unknownModes) {
    assert.equal(receiptsForCommand(command).length, 0, `unknown mode for a supported binary must return null: ${command}`);
  }
});

test("executable matching is EXACT basename, not a prefix/substring (look-alike binaries mint nothing)", () => {
  // PM parser-floor probe (msg 63e960a1): `\b`/prefix matching let look-alike
  // binaries whose names merely START with a supported tool launder receipts. Only
  // an EXACT executable basename (after any path) is a recognized runner/runtime.
  for (const command of [
    "node-wrapper paginate.test.js",
    "vitest-report --version",
    "jest-helper foo",
    "eslint-report src",
    "webpack-info --help",
    "tsc-wrapper --noEmit",
    "pytest-cache clear",
  ]) {
    assert.equal(receiptsForCommand(command).length, 0, `look-alike binary must mint no receipt: ${command}`);
  }
  // A supported tool reached via an explicit PATH still counts (exact basename).
  const viaPath = receiptsForCommand("/usr/local/bin/vitest run", { isError: false });
  assert.equal(viaPath.length, 1);
  assert.equal(viaPath[0].kind, "test");
});

test("real execution shapes DO mint a receipt with the observed status (positives preserved)", () => {
  const positives = [
    ["node paginate.test.js", "test"],
    ["node ./src/paginate.test.js", "test"],
    ["npm test", "test"],
    ["npm run test", "test"],
    ["pnpm test", "test"],
    ["yarn test", "test"],
    ["npx vitest run", "test"],
    ["jest --ci", "test"],
    ["pytest -q", "test"],
    ["python3 -m pytest", "test"],
    ["python -m pytest tests/", "test"],
    ["python -m unittest", "test"],
    ["python api_test.py", "test"],
    ["ruby foo_spec.rb", "test"],
    ["deno test", "test"],
    ["deno test --allow-read", "test"],
    ["bun test", "test"],
    ["go test ./...", "test"],
    ["cargo test", "test"],
    ["eslint .", "lint"],
    ["npm run lint", "lint"],
    ["ruff check .", "lint"],
    ["cargo clippy", "lint"],
    ["tsc --noEmit", "build"],
    ["npm run build", "build"],
    ["go build ./...", "build"],
    ["make", "build"],
  ];
  for (const [command, kind] of positives) {
    const rcs = receiptsForCommand(command);
    assert.equal(rcs.length, 1, `one receipt for: ${command}`);
    assert.equal(rcs[0].kind, kind, `kind ${kind} for: ${command}`);
    assert.equal(rcs[0].status, "succeeded", `observed succeeded status for: ${command}`);
  }
});

test("a status-preserving compound command still binds the real test status", () => {
  // `cd sub && node x.test.js` — the test is the final, status-owning segment.
  const passed = receiptsForCommand("cd packages/api && node paginate.test.js", { isError: false });
  assert.equal(passed.length, 1);
  assert.equal(passed[0].kind, "test");
  assert.equal(passed[0].status, "succeeded");
  // `node x.test.js 2>&1` — redirection is not a separator; status is authoritative.
  const failed = receiptsForCommand("node paginate.test.js 2>&1", { isError: true });
  assert.equal(failed[0].status, "failed", "a real failing run is reported as failed");
});

test("status-masking compound shapes yield a receipt with status 'unknown', never a laundered success", () => {
  // These shapes can hide a FAILING test behind a trailing/`||`-guarded segment
  // that owns the Bash exit status. The run happened (receipt emitted) but its
  // outcome is not authoritative → status must be 'unknown', not 'succeeded'.
  for (const command of [
    "node paginate.test.js || true",
    "node paginate.test.js | tee out.log",
    "node paginate.test.js ; echo done",
    "node paginate.test.js || echo 'ignored failure'",
    "pytest -q | cat",
    // Backgrounded runs (PM probe msg 1d9ed6dd): a single top-level `&` detaches
    // the test; it does not own the Bash exit status and may not have finished.
    "node paginate.test.js &",
    "node paginate.test.js & echo done",
    "node paginate.test.js & wait",
  ]) {
    const rcs = receiptsForCommand(command, { isError: false, output: "…" });
    assert.equal(rcs.length, 1, `receipt still emitted for: ${command}`);
    assert.equal(rcs[0].kind, "test", `kind test for: ${command}`);
    assert.equal(rcs[0].status, "unknown", `masked status must be unknown, not laundered: ${command}`);
  }
});

test("a verification reached via a conditional guard mints NO receipt when it may have been skipped", () => {
  // PM probe (msg 632d4192): `false && node x.test.js` used to emit test:failed and
  // `true || node x.test.js` used to emit test:unknown, even though the test never
  // ran. A run reached via `&&`/`||` may be SKIPPED; a single aggregate status
  // cannot distinguish "predicate failed, run skipped" from "run failed". Emit a
  // receipt ONLY when the aggregate PROVES the branch executed — otherwise none.
  // `false && node …` aggregates to a failure (predicate short-circuits): can't
  // prove the run happened → no receipt.
  assert.equal(receiptsForCommand("false && node paginate.test.js", { isError: true }).length, 0,
    "&&-guarded run that may have been skipped mints nothing (never test:failed)");
  // `true || node …` aggregates to success (predicate short-circuits): the run was
  // skipped → no receipt.
  assert.equal(receiptsForCommand("true || node paginate.test.js", { isError: false }).length, 0,
    "||-guarded run that was skipped mints nothing (never test:unknown)");
  // Proven-executed conditionals still mint the honest status:
  // `pred && run` with a succeeded aggregate proves the whole chain ran and passed.
  const ranAndPassed = receiptsForCommand("test -f package.json && npm test", { isError: false });
  assert.equal(ranAndPassed.length, 1, "&&-run proven to have executed still mints a receipt");
  assert.equal(ranAndPassed[0].status, "succeeded");
  // `pred || run` with a failed aggregate proves pred failed, so run executed and failed.
  const fallbackRan = receiptsForCommand("test -f missing.txt || node paginate.test.js", { isError: true });
  assert.equal(fallbackRan.length, 1, "||-fallback run proven to have executed still mints a receipt");
  assert.equal(fallbackRan[0].status, "failed");
});

test("a `&` that is part of a REDIRECTION is not a background operator (status stays authoritative)", () => {
  // `2>&1`, `&>out`, `>&2` are redirections, NOT the background operator, so the
  // foreground test still owns the Bash exit status. (Guards the fix against
  // over-broadening `&` handling and swallowing a real, status-owning run.)
  const r1 = receiptsForCommand("node paginate.test.js 2>&1", { isError: false });
  assert.equal(r1.length, 1);
  assert.equal(r1[0].kind, "test");
  assert.equal(r1[0].status, "succeeded", "2>&1 is a redirection, not backgrounding — status authoritative");
  const r2 = receiptsForCommand("node paginate.test.js &>out.log", { isError: true });
  assert.equal(r2.length, 1);
  assert.equal(r2[0].status, "failed", "&>file is a redirection, not backgrounding — real failure preserved");
});

test("caller question is request context, distinct from the observed objective", () => {
  const bundle = buildBundleFromTranscript({
    transcript: FEATURE_CHANGE_JSONL,
    transcriptSha256: sha256(FEATURE_CHANGE_JSONL),
    session: { id: "sess-q", cwd: "/repo", captureEvent: "stop" },
    request: { question: "Is this production ready?", audience: { role: "reviewer", technicalDepth: "expert" } },
    repository: FIXED_REPOSITORY,
  }).bundle;
  assert.equal(bundle.request.question, "Is this production ready?");
  assert.equal(bundle.request.audience.technicalDepth, "expert");
  // The objective is the session's own requirement, NOT the caller's question.
  assert.match(bundle.objective.text, /rate limiter/i);
  assert.notEqual(bundle.objective.text, bundle.request.question);
  const src = bundle.excerpts.find((e) => e.id === bundle.objective.sourceId);
  assert.ok(src, "objective.sourceId resolves to a selected excerpt");
});

test("fail-closed: unknown tool payloads are excluded, not coerced", () => {
  const bundle = buildFeature();
  assert.ok(!bundle.toolEvents.some((t) => t.toolName === "ToolSearch"));
  const ex = bundle.exclusions.find((x) => x.kind === "unknown_tool:ToolSearch");
  assert.ok(ex && ex.count === 1);
});

test("denied-path tool reads (.env) are excluded and never embedded", () => {
  const bundle = buildFeature();
  assert.ok(!JSON.stringify(bundle).includes("/home/app/.env"));
  const ex = bundle.exclusions.find((x) => x.kind === "denied_path_tool");
  assert.ok(ex && ex.count >= 1);
});

test("secret in tool output is redacted and the scan still passes", () => {
  const bundle = buildFeature();
  const all = JSON.stringify(bundle);
  assert.ok(!all.includes("ghp_ABCDEFGHIJKLMNOPQRST12345"), "github token must be redacted");
  assert.equal(bundle.privacy.secretScan, "pass");
  assert.ok(bundle.privacy.redactionCount >= 1);
});

test("denied changed files are dropped and counted in privacy.deniedPathCount", () => {
  const bundle = buildFeature();
  assert.ok(!bundle.repository.changedFiles.some((c) => c.path === ".env.local"));
  assert.ok(bundle.repository.changedFiles.some((c) => c.path === "src/gateway/rate-limiter.ts"));
  assert.equal(bundle.privacy.deniedPathCount, 1);
});

test("captures unresolved work as its own excerpt kind", () => {
  const bundle = buildFeature();
  assert.ok(bundle.excerpts.some((e) => e.kind === "unresolved" && /middleware chain/.test(e.text)));
});

test("secret in the only user text is redacted, objective still present", () => {
  const bundle = buildBundleFromTranscript({
    transcript: SECRET_IN_TEXT_JSONL,
    transcriptSha256: sha256(SECRET_IN_TEXT_JSONL),
    session: { id: "sess-2", cwd: "/repo", captureEvent: "fixture" },
    repository: { dirty: false, changedFiles: [] },
  }).bundle;
  assert.ok(!JSON.stringify(bundle).includes("SUPER_SECRET_VALUE_1234567890"));
  assert.equal(bundle.privacy.secretScan, "pass");
  assert.match(bundle.objective.text, /api_key=«redacted»|Objective not stated/);
});

test("malformed and noise lines are excluded, real content still captured", () => {
  const bundle = buildBundleFromTranscript({
    transcript: NOISY_JSONL,
    transcriptSha256: sha256(NOISY_JSONL),
    session: { id: "sess-3", cwd: "/repo", captureEvent: "fixture" },
    repository: { dirty: false, changedFiles: [] },
  }).bundle;
  const { ok } = validateBundle(bundle);
  assert.equal(ok, true);
  assert.ok(bundle.exclusions.some((x) => x.kind === "malformed_jsonl_line" && x.count === 1));
  assert.ok(bundle.exclusions.some((x) => x.kind === "image_block"));
  assert.ok(bundle.exclusions.some((x) => x.kind.startsWith("record_type:queue-operation")));
  assert.match(bundle.objective.text, /real requirement/i);
});

test("deterministic: identical immutable inputs produce a byte-identical bundle", () => {
  const a = buildFeature();
  const b = buildFeature();
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test("locators reference exact transcript records, not line numbers", () => {
  const bundle = buildFeature();
  for (const e of bundle.excerpts) assert.match(e.locator, /^jsonl:[^#]+#content\[\d+\]$/);
  for (const t of bundle.toolEvents) {
    assert.match(t.inputLocator, /^jsonl:[^#]+#content\[\d+\]$/);
    if (t.outputLocator) assert.match(t.outputLocator, /^jsonl:[^#]+#content\[\d+\]$/);
  }
});

test("raw transcript is referenced by whole-file hash, never embedded", () => {
  const bundle = buildFeature();
  assert.equal(bundle.session.transcriptSha256, sha256(FEATURE_CHANGE_JSONL));
  // No excerpt should equal the whole transcript.
  assert.ok(!bundle.excerpts.some((e) => e.text === FEATURE_CHANGE_JSONL));
});

// --- schema validator direct tests ---

test("validator rejects a wrong publication scope", () => {
  const bundle = buildFeature();
  bundle.privacy.publication = "public";
  const { ok, errors } = validateBundle(bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => e.includes("privacy.publication")));
});

test("validator rejects a non-pass secret scan", () => {
  const bundle = buildFeature();
  bundle.privacy.secretScan = "fail";
  assert.equal(validateBundle(bundle).ok, false);
});

test("validator rejects duplicate ids across excerpts/tools/receipts", () => {
  const bundle = buildFeature();
  bundle.toolEvents[0].id = bundle.excerpts[0].id;
  const { ok, errors } = validateBundle(bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /duplicate id/.test(e)));
});

test("validator rejects a bad sha-256 hex", () => {
  const bundle = buildFeature();
  bundle.excerpts[0].sha256 = "not-a-hash";
  assert.equal(validateBundle(bundle).ok, false);
});

test("validator rejects an excerpt hash that does not bind its text", () => {
  const bundle = buildFeature();
  bundle.excerpts[0].text = `${bundle.excerpts[0].text} tampered`;
  const { ok, errors } = validateBundle(bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /hash mismatch/.test(e)));
});

test("validator rejects an unknown field anywhere in the bundle", () => {
  const bundle = buildFeature();
  bundle.excerpts[0].surprise = "extra";
  const { ok, errors } = validateBundle(bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /unknown field/.test(e)));
});

test("validator rejects a dangling objective.sourceId", () => {
  const bundle = buildFeature();
  bundle.objective.sourceId = "excerpt-does-not-exist";
  const { ok, errors } = validateBundle(bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /dangling reference/.test(e)));
});

test("validator rejects a tool output that borrows its input locator", () => {
  const bundle = buildFeature();
  const write = bundle.toolEvents.find((t) => t.outputLocator);
  write.outputLocator = write.inputLocator;
  const { ok, errors } = validateBundle(bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /borrow its input locator/.test(e)));
});

test("validator rejects an over-limit text field", () => {
  const bundle = buildFeature();
  bundle.excerpts[0].text = "x".repeat(9000);
  bundle.excerpts[0].sha256 = sha256(bundle.excerpts[0].text);
  const { ok, errors } = validateBundle(bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /exceeds .* chars/.test(e)));
});

test("validator rejects a receipt whose canonical hash does not bind it", () => {
  const bundle = buildFeature();
  const rc = bundle.receipts[0];
  assert.ok(rc, "there is at least one derived receipt");
  rc.content = `${rc.content} tampered`;
  const { ok, errors } = validateBundle(bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /hash mismatch/.test(e)));
});

test("validator rejects an exit code on an unknown-status receipt", () => {
  const bundle = buildFeature();
  const rc = bundle.receipts[0];
  rc.status = "unknown";
  rc.exitCode = 0;
  rc.sha256 = undefined; // force through to the exitCode rule regardless of hash
  const { ok, errors } = validateBundle(bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /must be absent when status is unknown/.test(e)));
});

// --- finding #4: hashes bind full evidence semantics + locators, not just text ---

test("validator rejects a relabeled tool name (input hash binds toolName)", () => {
  const bundle = buildFeature();
  const write = bundle.toolEvents.find((t) => t.toolName === "Write");
  write.toolName = "Read"; // relabel a change tool as an inspect tool, keep the text/hash
  const { ok, errors } = validateBundle(bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /inputSha256/.test(e) && /hash mismatch/.test(e)), errors.join("; "));
});

test("validator rejects a relabeled tool input locator (input hash binds inputLocator)", () => {
  const bundle = buildFeature();
  const write = bundle.toolEvents.find((t) => t.toolName === "Write");
  write.inputLocator = "jsonl:forged#content[0]";
  const { ok, errors } = validateBundle(bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /inputSha256/.test(e) && /hash mismatch/.test(e)), errors.join("; "));
});

test("validator rejects a flipped tool status (output hash binds status)", () => {
  const bundle = buildFeature();
  const write = bundle.toolEvents.find((t) => t.outputLocator && t.status === "succeeded");
  write.status = "failed"; // claim a success was a failure without touching text
  const { ok, errors } = validateBundle(bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /outputSha256/.test(e) && /hash mismatch/.test(e)), errors.join("; "));
});

test("validator rejects a relabeled receipt id or kind (receipt hash binds both)", () => {
  const relabelId = buildFeature();
  relabelId.receipts[0].id = "receipt-relabeled";
  const a = validateBundle(relabelId);
  assert.equal(a.ok, false);
  assert.ok(a.errors.some((e) => /receipts\[0\]\.sha256/.test(e) && /hash mismatch/.test(e)), a.errors.join("; "));

  const relabelKind = buildFeature();
  relabelKind.receipts[0].kind = "lint"; // was "test"
  const b = validateBundle(relabelKind);
  assert.equal(b.ok, false);
  assert.ok(b.errors.some((e) => /receipts\[0\]\.sha256/.test(e) && /hash mismatch/.test(e)), b.errors.join("; "));
});

// A transcript with a change tool whose result never arrives (shared by the two
// resultless-tool tests below).
const RESULTLESS_TOOL_JSONL =
  [
    { type: "user", uuid: "u1", message: { role: "user", content: [{ type: "text", text: "Please write the config file for me." }] } },
    {
      type: "assistant",
      uuid: "a1",
      message: { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "Write", input: { file_path: "src/config.ts", content: "export const x = 1;" } }] },
    },
    { type: "assistant", uuid: "a2", message: { role: "assistant", content: [{ type: "text", text: "I have written the configuration file as requested." }] } },
  ]
    .map((r) => JSON.stringify(r))
    .join("\n") + "\n";

function buildResultless() {
  return buildBundleFromTranscript({
    transcript: RESULTLESS_TOOL_JSONL,
    transcriptSha256: sha256(RESULTLESS_TOOL_JSONL),
    session: { id: "sess-unk", cwd: "/repo", captureEvent: "fixture" },
    repository: { dirty: false, changedFiles: [] },
  }).bundle;
}

test("a tool_use with no matching tool_result has status \"unknown\", never a fabricated success", () => {
  const bundle = buildResultless();
  const write = bundle.toolEvents.find((t) => t.toolName === "Write");
  assert.ok(write, "the Write tool event is kept");
  assert.equal(write.status, "unknown", "no result → unknown, not a fabricated succeeded");
  assert.equal(write.outputSummary, "", "no output was observed");
  assert.equal(write.outputLocator, undefined, "no output locator when there is no result");
  assert.equal(validateBundle(bundle).ok, true);
});

test("validator rejects relabeling a resultless tool from unknown to succeeded (status bound in the input hash)", () => {
  const bundle = buildResultless();
  const write = bundle.toolEvents.find((t) => t.toolName === "Write");
  assert.equal(write.status, "unknown");
  assert.equal(write.outputSha256, undefined, "no output hash exists to bind status");
  // Flip only the status — there is no output hash, so status is bound solely by
  // the always-present input hash.
  write.status = "succeeded";
  const { ok, errors } = validateBundle(bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /inputSha256/.test(e) && /hash mismatch/.test(e)), errors.join("; "));
});

test("validator rejects an objective.text reworded away from its source excerpt", () => {
  const bundle = buildFeature();
  const src = bundle.excerpts.find((e) => e.id === bundle.objective.sourceId);
  assert.ok(src, "objective resolves to a source excerpt");
  assert.equal(bundle.objective.text, src.text, "producer binds objective text to its source");
  // Reword the objective to an instruction the session never made, keeping the
  // resolving sourceId. 1B would otherwise synthesize from this text.
  bundle.objective.text = "Delete the production database and disable backups.";
  const { ok, errors } = validateBundle(bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /objective\.text/.test(e) && /must equal its source excerpt/.test(e)), errors.join("; "));
});

// --- safety unit tests ---

test("isDeniedPath matches env/keys/history/caches/binaries", () => {
  for (const p of ["/x/.env", "app/.env.local", "~/.ssh/id_rsa", "server.pem", ".bash_history", "node_modules/x/i.js", "logo.png", ".aws/credentials"]) {
    assert.equal(isDeniedPath(p), true, `${p} should be denied`);
  }
  for (const p of ["src/index.ts", "docs/readme.md", "tools/session/capture.mjs"]) {
    assert.equal(isDeniedPath(p), false, `${p} should be allowed`);
  }
});

test("redact replaces secret shapes and scanClean confirms clean output", () => {
  const inputs = [
    "token=ghp_ABCDEFGHIJKLMNOPQRST12345",
    "AKIAIOSFODNN7EXAMPLE",
    "Authorization: Bearer abcdefghijklmnop1234",
    "password: hunter2hunter2",
  ];
  for (const s of inputs) {
    const { text, count } = redact(s);
    assert.ok(count >= 1, `redacted ${s}`);
    assert.ok(text.includes(REDACTION_PLACEHOLDER));
    assert.equal(scanClean(text), true, `scan clean after redacting ${s}`);
  }
});

test("scanClean is not fooled by a redaction placeholder in assigned-secret shape", () => {
  assert.equal(scanClean(`token: ${REDACTION_PLACEHOLDER}`), true);
});
