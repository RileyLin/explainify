// Deterministic serialization + hashing helpers for session capture output.
// Mirrors tools/comprehension/util.mjs (stable key ordering) so a bundle/receipt
// hashes identically across runs on immutable inputs — the determinism the
// acceptance gate requires. Kept local to tools/session so this module set has
// no dependency on the comparative engine.

import { createHash } from "node:crypto";

export const stableStringify = (value) => JSON.stringify(sort(value), null, 2);

function sort(value) {
  if (Array.isArray(value)) return value.map(sort);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sort(value[key])]),
    );
  }
  return value;
}

export const sha256Of = (value) => createHash("sha256").update(value).digest("hex");
