import { execFileSync } from "node:child_process";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { sha256 } from "./util.mjs";

const denied = /(^|[/\\])(\.env[^/\\]*|\.git-credentials|credentials|id_rsa|node_modules|\.next|dist|build)([/\\]|$)/i;
const secret = /(REDACT_ME_7F3A|PRIVATE_CANARY|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:api[_-]?key|token|password)\s*[:=]\s*\S+)/i;

export function assertSafe(value, label = "input") {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (denied.test(text)) throw new Error(`Denied path in ${label}`);
  if (secret.test(text)) throw new Error(`Sensitive content in ${label}`);
}

function git(root, args) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
}

export async function collectEvidence(request) {
  const root = await realpath(request.repository.root);
  const resolved = {};
  const sources = [];
  if (request.repository.baseRef) {
    resolved.base = git(root, ["rev-parse", `${request.repository.baseRef}^{commit}`]);
    resolved.head = git(root, ["rev-parse", `${request.repository.headRef}^{commit}`]);
    const stat = git(root, ["diff", "--stat", resolved.base, resolved.head]);
    sources.push({
      id: "change-set",
      kind: "git_diff",
      locator: `git:${resolved.base}..${resolved.head}`,
      revision: resolved.head,
      sha256: sha256(stat),
      selectedContent: stat,
      containsSecrets: false,
    });
    for (const [index, change] of (request.changes || []).entries()) {
      const [, locator, requestedStart, requestedEnd] = change;
      if (locator === "task-receipts" || locator === "git-diff-stat" || locator === "git-commit-message") continue;
      assertSafe(locator, "claim path");
      const content = git(root, ["show", `${resolved.head}:${locator}`]);
      const lines = content.split("\n");
      const startLine = Math.max(1, Math.min(requestedStart, lines.length));
      const endLine = Math.max(startLine, Math.min(requestedEnd, lines.length));
      const excerpt = lines.slice(startLine - 1, endLine).join("\n");
      assertSafe(excerpt, "claim evidence");
      sources.push({
        id: `claim-${index + 1}-source`,
        kind: "file",
        locator: `git:${resolved.head}:${locator}`,
        revision: resolved.head,
        startLine,
        endLine,
        sha256: sha256(excerpt),
        selectedContent: excerpt,
        containsSecrets: false,
      });
    }
    if (request.selectedContent) {
      assertSafe(request.selectedContent, "selected task notes");
      sources.push({
        id: "task-receipts",
        kind: "task_thread",
        locator: "selected-task-receipts:1-5",
        sha256: sha256(request.selectedContent),
        selectedContent: request.selectedContent,
        containsSecrets: false,
      });
    }
  } else if (request.source) {
    assertSafe(request.source, "document path");
    const file = await realpath(path.join(root, request.source));
    if (!file.startsWith(`${root}${path.sep}`)) throw new Error("Document escapes repository root");
    const content = await readFile(file, "utf8");
    assertSafe(content, "document content");
    sources.push({
      id: "document",
      kind: "document",
      locator: request.source,
      sha256: sha256(content),
      selectedContent: content,
      containsSecrets: false,
    });
    const lines = content.split("\n");
    for (const [index, phrase] of (request.phrases || []).entries()) {
      const terms = phrase.toLowerCase().replace(/[.,]/g, "").split(/\s+/).filter((term) => term.length > 4);
      const lineIndex = lines.findIndex((line) => terms.some((term) => line.toLowerCase().includes(term)));
      const startLine = request.phraseLines?.[index] || (lineIndex === -1 ? 1 : lineIndex + 1);
      const excerpt = lines[startLine - 1];
      sources.push({
        id: `claim-${index + 1}-source`,
        kind: "document",
        locator: request.source,
        startLine,
        endLine: startLine,
        sha256: sha256(excerpt),
        selectedContent: excerpt,
        containsSecrets: false,
      });
    }
  } else if (request.fixture) {
    const allowed = request.fixture.sources.filter((source) => {
      if (source.id === "unsafe-note") return false;
      try {
        assertSafe(source.locator, "fixture locator");
        assertSafe(source.content, "fixture content");
        return true;
      } catch {
        return false;
      }
    });
    sources.push(...allowed.map((source) => ({
      id: source.id,
      kind: source.kind,
      locator: source.locator,
      sha256: sha256(source.content),
      selectedContent: source.content,
      containsSecrets: false,
    })));
  }
  if (!sources.length) throw new Error("At least one safe evidence source is required");
  return { root, resolved, sources };
}

export function scanOutput(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (secret.test(text)) throw new Error("Secret scan failed");
  if (/safe to merge|no risk/i.test(text)) throw new Error("Unsupported approval claim");
}
