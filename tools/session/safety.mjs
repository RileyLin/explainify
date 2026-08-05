// Session capture safety: denied-path gating and content redaction.
//
// The contract (docs/product/session-to-explain-v1.md §Privacy Boundary) is
// strict: `.env*`, credential stores, shell history, private keys, tokens,
// dependency trees, caches, and binaries are denied BEFORE selection, and every
// selected excerpt is redacted. secretScan must end "pass" — a secret that
// survives redaction aborts capture rather than shipping.
//
// This is deliberately a superset of tools/comprehension/evidence.mjs's denial
// (which is scoped to git-tracked source claims); session transcripts can
// reference anything a shell touched, so the net is wider here.

// Path fragments that must never be read as evidence. Matched case-insensitively
// against any path-like token in a locator or file path.
const DENIED_PATH = new RegExp(
  [
    "(^|[/\\\\])\\.env([.][^/\\\\]*)?([/\\\\]|$)", // .env, .env.local, ...
    "(^|[/\\\\])\\.git-credentials([/\\\\]|$)",
    "(^|[/\\\\])credentials([/\\\\]|$)",
    "(^|[/\\\\])\\.aws([/\\\\]|$)",
    "(^|[/\\\\])\\.ssh([/\\\\]|$)",
    "(^|[/\\\\])id_(rsa|ed25519|ecdsa|dsa)([/\\\\]|$)",
    "(^|[/\\\\])\\.npmrc([/\\\\]|$)",
    "(^|[/\\\\])\\.netrc([/\\\\]|$)",
    "(^|[/\\\\])\\.(bash|zsh|sh)_history([/\\\\]|$)",
    "(^|[/\\\\])\\.history([/\\\\]|$)",
    "(^|[/\\\\])node_modules([/\\\\]|$)",
    "(^|[/\\\\])\\.next([/\\\\]|$)",
    "(^|[/\\\\])(dist|build|coverage|\\.cache|\\.turbo)([/\\\\]|$)",
    "\\.(pem|key|p12|pfx|keystore)$",
    "\\.(png|jpe?g|gif|ico|pdf|zip|tar|gz|woff2?|ttf|mp4|wasm)$", // binaries
  ].join("|"),
  "i",
);

// Secret-shaped content patterns. Each match is replaced with a stable
// placeholder and counted. Ordered from most to least specific.
const SECRET_PATTERNS = [
  { name: "canary", re: /(REDACT_ME_7F3A|PRIVATE_CANARY)/g },
  { name: "private_key_block", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g },
  { name: "aws_access_key", re: /AKIA[0-9A-Z]{16}/g },
  // NOTE: a bare 40-char base64 "AWS secret" heuristic is deliberately NOT used
  // — it false-positives on git SHAs and base64 payloads. An AWS secret that
  // appears as `secret=...`/`aws_secret_access_key: ...` is still caught by the
  // assigned_secret pattern below; the canary/AKIA patterns cover the gate.
  { name: "bearer", re: /\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/g },
  { name: "github_token", re: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g },
  { name: "slack_token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { name: "assigned_secret", re: /((?:api[_-]?key|secret|token|password|passwd|pwd)\s*[:=]\s*)("[^"]+"|'[^']+'|\S+)/gi },
];

export const REDACTION_PLACEHOLDER = "«redacted»";

export function isDeniedPath(pathLike) {
  if (typeof pathLike !== "string") return false;
  return DENIED_PATH.test(pathLike);
}

// Redact secret-shaped substrings from text. Returns { text, count } where text
// has every match replaced by REDACTION_PLACEHOLDER (assigned-secret matches
// keep their leading key= so the shape stays readable) and count is the total
// number of redactions. Pure — no throwing.
export function redact(text) {
  if (typeof text !== "string" || text.length === 0) return { text: text ?? "", count: 0 };
  let out = text;
  let count = 0;
  for (const { name, re } of SECRET_PATTERNS) {
    out = out.replace(re, (match, p1) => {
      count += 1;
      if (name === "assigned_secret") return `${p1}${REDACTION_PLACEHOLDER}`;
      return REDACTION_PLACEHOLDER;
    });
  }
  return { text: out, count };
}

// After redaction, confirm no secret shape remains. Used to enforce
// privacy.secretScan === "pass": if this returns false, capture must abort.
export function scanClean(text) {
  if (typeof text !== "string") return true;
  // Placeholders are the OUTPUT of redaction, not a residual secret. Neutralize
  // them before re-scanning:
  //  1. Drop a whole redacted assignment (`token=«redacted»`) — key, separator,
  //     and value together — so removing it doesn't glue `token=` to the next
  //     word and re-trigger the assigned-secret shape.
  //  2. Drop any remaining standalone placeholder.
  const ph = REDACTION_PLACEHOLDER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const assignedPh = new RegExp(
    `((?:api[_-]?key|secret|token|password|passwd|pwd)\\s*[:=]\\s*)${ph}`,
    "gi",
  );
  const cleaned = text.replace(assignedPh, " ").split(REDACTION_PLACEHOLDER).join(" ");
  return !SECRET_PATTERNS.some(({ re }) => {
    re.lastIndex = 0;
    const hit = re.test(cleaned);
    re.lastIndex = 0;
    return hit;
  });
}
