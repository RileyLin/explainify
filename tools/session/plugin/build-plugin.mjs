#!/usr/bin/env node
// Deterministic packager for the Explainify session plugin (Phase 1D).
//
// The plugin must be installable from ANY repository via the official Claude
// Code local-plugin mechanism, so it cannot reference the Explainify checkout at
// runtime. This script assembles a SELF-CONTAINED plugin under
//   tools/session/plugin/lib/
// by:
//   1. copying the exact runtime source closure VERBATIM (byte-identical to the
//      audited canonical files) preserving the tools/... relative tree, so every
//      relative import resolves inside the plugin with NO rewriting; and
//   2. redirecting ONLY the three third-party import specifiers in the copied
//      mcp-server.mjs (@modelcontextprotocol/sdk ×2, zod) to a single vendored
//      esbuild bundle at lib/vendor/mcp-vendor.mjs.
//
// Everything the plugin launches (the MCP server, the hook) then resolves from
// ${CLAUDE_PLUGIN_ROOT} alone: at RUNTIME the plugin needs no node_modules, no
// network of its own, and no build step (Claude Code may fetch the plugin over
// the network at install time). `--check` re-runs the build into a temp dir and byte-compares,
// failing if the committed lib/ has drifted from canonical source (drift guard).

import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, relative } from "node:path";
import { mkdir, readFile, writeFile, rm, readdir, stat } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url)); // tools/session/plugin
const REPO = join(HERE, "..", "..", ".."); // repo root

// The runtime source closure the MCP server + hook need, relative to repo root.
// Kept in the tools/... layout so relative imports need no rewriting.
const SOURCE_FILES = [
  "tools/session/mcp-server.mjs",
  "tools/session/integrate.mjs",
  "tools/session/claude-adapter.mjs",
  "tools/session/capture.mjs",
  "tools/session/receipt.mjs",
  "tools/session/safety.mjs",
  "tools/session/bundle-schema.mjs",
  "tools/session/change-story-schema.mjs",
  "tools/session/latest-pointer.mjs",
  "tools/session-synthesis/change-story.mjs",
  "tools/session-synthesis/session-synthesis.mjs",
  "tools/workstream-brief/brief.mjs",
  "tools/workstream-brief/freeze.mjs",
  "tools/comprehension/evidence.mjs",
  "tools/comprehension/util.mjs",
];

// The single file whose third-party imports are redirected to the vendor bundle.
const ENTRY = "tools/session/mcp-server.mjs";
// From lib/tools/session/ up to lib/vendor/mcp-vendor.mjs.
const VENDOR_REL = "../../vendor/mcp-vendor.mjs";

// Byte-exact original import lines → vendor-bundle imports. If mcp-server.mjs's
// import block changes upstream, this list must be updated in lockstep; the
// build throws if any expected line is absent so drift can never pass silently.
const IMPORT_REDIRECTS = [
  [
    'import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";',
    `import { McpServer } from "${VENDOR_REL}";`,
  ],
  [
    'import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";',
    `import { StdioServerTransport } from "${VENDOR_REL}";`,
  ],
  [
    'import { z } from "zod";',
    `import { z } from "${VENDOR_REL}";`,
  ],
];

function redirectEntryImports(src) {
  let out = src;
  for (const [from, to] of IMPORT_REDIRECTS) {
    if (!out.includes(from)) {
      throw new Error(`mcp-server.mjs no longer contains expected import line:\n  ${from}\nUpdate IMPORT_REDIRECTS in build-plugin.mjs.`);
    }
    out = out.replace(from, to);
  }
  return out;
}

function esbuildBin() {
  // `esbuild` is a DECLARED devDependency (package.json), not a transitive of
  // vite — so the build never silently depends on a hoisted copy. Fail with a
  // clear, actionable message if the binary is missing.
  const bin = join(REPO, "node_modules", ".bin", "esbuild");
  if (!existsSync(bin)) {
    throw new Error(`esbuild binary not found at ${bin}. Run \`npm install\` (esbuild is a declared devDependency) before building the plugin.`);
  }
  return bin;
}

// Strip trailing whitespace from every line. esbuild inlines third-party source
// verbatim, and some of it (e.g. Zod's codegen template literals) carries
// trailing spaces that trip `git diff --check`. Trailing whitespace at end of
// line is never semantically meaningful in the emitted JS, so this normalization
// is safe; it is applied identically on build AND on --check, so the committed
// bundle stays byte-stable against a fresh build (the drift guard still holds).
function normalizeTrailingWhitespace(text) {
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n");
}

// Resolve a bundled input file to the ROOT directory of the package that owns
// it — the nearest ancestor directory whose package.json declares a `name`.
// Walking up (rather than collapsing on the package NAME) is required because
// the same name can appear at multiple versions in different node_modules trees:
// the bundle inlines `ajv@8.18.0` under `ajv-formats/node_modules/ajv`, while the
// repo root has an unrelated `ajv@6.14.0`. We must also skip internal subpath
// markers — packages like `zod` and `@modelcontextprotocol/sdk` ship nested
// `package.json` files (e.g. `zod/v4/package.json`, `dist/esm/package.json`) that
// set only `type`/`sideEffects` and NO `name`; those are not package roots.
// Returns an absolute package-root path, or null.
function packageRootFor(inputRelPath) {
  let dir = dirname(join(REPO, inputRelPath));
  for (let i = 0; i < 50; i += 1) {
    const pj = join(dir, "package.json");
    if (existsSync(pj)) {
      try {
        const parsed = JSON.parse(readFileSync(pj, "utf8"));
        if (typeof parsed.name === "string" && parsed.name.length > 0) return dir;
      } catch {
        /* unreadable — treat as not-a-root and keep walking */
      }
    }
    const parent = dirname(dir);
    if (parent === dir || relative(REPO, parent).startsWith("..")) return null;
    dir = parent;
  }
  return null;
}

// Discover the ACTUAL set of packages esbuild inlined into the bundle, from its
// --metafile, deduped by real package ROOT (so distinct versions of the same
// name are kept separate). Driving the notices off the real closure — not a hand
// list — means a new (or newly-nested) dependency can never ship without its
// notice. Returns sorted absolute package-root paths.
function bundledPackageRootsFromMetafile(meta) {
  const roots = new Set();
  for (const input of Object.keys(meta.inputs || {})) {
    if (!input.includes("node_modules/")) continue;
    const root = packageRootFor(input);
    if (root) roots.add(root);
  }
  return [...roots].sort();
}

// The three third-party specifiers the vendor bundle exports. Single source of
// truth for both the real build and the license-closure computation used by
// tests, so they can never diverge.
const VENDOR_ENTRY_SRC = [
  'export { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";',
  'export { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";',
  'export { z } from "zod";',
  "",
].join("\n");

const ESBUILD_FLAGS = ["--bundle", "--platform=node", "--format=esm", "--target=node20", "--external:node:*"];

async function buildVendorBundle(libDir) {
  // Emit a tiny entry inside the repo (so esbuild resolves node_modules), bundle
  // the runtime deps into one ESM file with a metafile, then remove the entry.
  const entryPath = join(HERE, ".vendor-entry.mjs");
  const metaPath = join(HERE, ".vendor-meta.json");
  await writeFile(entryPath, VENDOR_ENTRY_SRC, "utf8");
  const outFile = join(libDir, "vendor", "mcp-vendor.mjs");
  try {
    await mkdir(dirname(outFile), { recursive: true });
    execFileSync(
      esbuildBin(),
      [entryPath, ...ESBUILD_FLAGS, `--metafile=${metaPath}`, `--outfile=${outFile}`],
      { cwd: REPO, stdio: ["ignore", "ignore", "inherit"] },
    );
    // Deterministically normalize the emitted bundle so the committed tree is
    // clean under `git diff --check` and stable against a fresh rebuild.
    await writeFile(outFile, normalizeTrailingWhitespace(await readFile(outFile, "utf8")), "utf8");
    const meta = JSON.parse(await readFile(metaPath, "utf8"));
    await writeLicenseNotices(libDir, bundledPackageRootsFromMetafile(meta));
  } finally {
    await rm(entryPath, { force: true });
    await rm(metaPath, { force: true });
  }
}

// Compute the ACTUAL bundled license closure the same way the build does —
// esbuild metafile → nearest-named-package roots → dedup by name@version — but
// WITHOUT writing anything into lib/. Returns the resolved [{name,version,
// license}] closure. Exported so a regression can assert the exact closure
// (including nested versions like ajv 8.18.0) drives the notices, independent of
// the committed LICENSES.md text. Uses a throwaway temp outfile/metafile.
export async function computeLicenseClosure() {
  const entryPath = join(HERE, ".vendor-entry.closure.mjs");
  const metaPath = join(HERE, ".vendor-meta.closure.json");
  const outFile = join(HERE, ".vendor-out.closure.mjs");
  await writeFile(entryPath, VENDOR_ENTRY_SRC, "utf8");
  try {
    execFileSync(
      esbuildBin(),
      [entryPath, ...ESBUILD_FLAGS, `--metafile=${metaPath}`, `--outfile=${outFile}`],
      { cwd: REPO, stdio: ["ignore", "ignore", "inherit"] },
    );
    const meta = JSON.parse(await readFile(metaPath, "utf8"));
    const { closure } = await buildLicenseManifest(bundledPackageRootsFromMetafile(meta));
    return closure;
  } finally {
    await rm(entryPath, { force: true });
    await rm(metaPath, { force: true });
    await rm(outFile, { force: true });
  }
}

// Build the license manifest from the resolved package ROOTS. Each root is read
// for its own name/version/license — so nested versions (ajv 8.18.0 vs a root
// ajv 6.14.0) are reported distinctly. Returns the manifest text plus the
// resolved [{name, version, license}] closure so callers/tests can assert it.
async function buildLicenseManifest(packageRoots) {
  if (!packageRoots || packageRoots.length === 0) {
    throw new Error("No bundled packages discovered from the esbuild metafile; refusing to ship a bundle with no license notices.");
  }
  const closure = [];
  const sections = [
    "# Third-party licenses",
    "",
    "The bundled runtime `mcp-vendor.mjs` inlines the following packages. Their",
    "license texts are reproduced verbatim below. This file is generated by",
    "`build-plugin.mjs` from the esbuild metafile (the actual bundled closure,",
    "resolved to each input's nearest package root so nested versions are exact);",
    "do not edit by hand.",
    "",
  ];
  // Read each root's identity, then dedupe by name+version: the same package at
  // the same version can be installed under multiple node_modules trees (e.g.
  // ajv 8.18.0 under both the SDK's and ajv-formats' node_modules), but it is one
  // distributable package needing one notice. DISTINCT versions of a name are
  // kept separate. Sort by name+version for a stable, filesystem-order-independent
  // manifest.
  const byKey = new Map();
  for (const root of packageRoots) {
    const pkgJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    const key = `${pkgJson.name}@${pkgJson.version}`;
    if (!byKey.has(key)) byKey.set(key, { root, name: pkgJson.name, version: pkgJson.version, license: pkgJson.license || "see below" });
  }
  const entries = [...byKey.values()];
  entries.sort((a, b) => (a.name === b.name ? a.version.localeCompare(b.version) : a.name.localeCompare(b.name)));
  for (const e of entries) {
    let text = "";
    for (const name of ["LICENSE", "LICENSE.md", "LICENSE.txt", "license", "LICENSE-MIT", "LICENSE-MIT.txt"]) {
      try {
        text = await readFile(join(e.root, name), "utf8");
        break;
      } catch {
        /* try next candidate */
      }
    }
    if (!text) {
      throw new Error(`No LICENSE file found for bundled dependency ${e.name}@${e.version} at ${e.root}; cannot ship the bundle without its notice.`);
    }
    sections.push(`## ${e.name} ${e.version} (${e.license})`, "", "```", text.trimEnd(), "```", "");
    closure.push({ name: e.name, version: e.version, license: e.license });
  }
  return { text: sections.join("\n"), closure };
}

async function writeLicenseNotices(libDir, packageRoots) {
  const { text } = await buildLicenseManifest(packageRoots);
  await writeFile(join(libDir, "vendor", "LICENSES.md"), text, "utf8");
}

async function assertVersionParity(entrySrc) {
  // Single source of truth: plugin.json's version. The MCP server advertises its
  // version to clients as a string literal, and the hook stamps the manifest
  // version into its pointer at runtime — so all three must agree. We can check
  // the server literal statically here; the hook reads the manifest directly.
  const manifest = JSON.parse(await readFile(join(HERE, ".claude-plugin", "plugin.json"), "utf8"));
  const version = manifest.version;
  if (typeof version !== "string") throw new Error("plugin.json has no string version.");
  if (!entrySrc.includes(`version: "${version}"`)) {
    throw new Error(
      `mcp-server.mjs must advertise the plugin.json version (${version}) to keep the MCP server and hook in sync. Update the McpServer({ version }) literal.`,
    );
  }
  return version;
}

async function assemble(libDir) {
  await rm(libDir, { recursive: true, force: true });
  await mkdir(libDir, { recursive: true });
  for (const rel of SOURCE_FILES) {
    const src = await readFile(join(REPO, rel), "utf8");
    if (rel === ENTRY) await assertVersionParity(src);
    const content = rel === ENTRY ? redirectEntryImports(src) : src;
    const dest = join(libDir, rel);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, content, "utf8");
  }
  await buildVendorBundle(libDir);
}

async function hashTree(dir) {
  // Content hash of every file under dir (path-sorted), for the drift check.
  const files = [];
  async function walk(d) {
    for (const name of (await readdir(d)).sort()) {
      const p = join(d, name);
      const s = await stat(p);
      if (s.isDirectory()) await walk(p);
      else files.push([relative(dir, p), await readFile(p)]);
    }
  }
  await walk(dir);
  files.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const h = createHash("sha256");
  for (const [rel, buf] of files) {
    h.update(rel);
    h.update("\0");
    h.update(buf);
    h.update("\0");
  }
  return { hash: h.digest("hex"), count: files.length };
}

async function main() {
  const check = process.argv.includes("--check");
  const libDir = join(HERE, "lib");
  if (check) {
    const tmp = join(HERE, ".lib-check");
    await assemble(tmp);
    let committed;
    try {
      committed = await hashTree(libDir);
    } catch {
      await rm(tmp, { recursive: true, force: true });
      throw new Error("Committed lib/ is missing. Run `node tools/session/plugin/build-plugin.mjs` and commit the result.");
    }
    const fresh = await hashTree(tmp);
    await rm(tmp, { recursive: true, force: true });
    if (committed.hash !== fresh.hash) {
      throw new Error(
        `Plugin lib/ has drifted from canonical source.\n  committed: ${committed.hash} (${committed.count} files)\n  rebuilt:   ${fresh.hash} (${fresh.count} files)\nRun \`node tools/session/plugin/build-plugin.mjs\` and commit.`,
      );
    }
    process.stdout.write(`plugin lib/ in sync: ${fresh.count} files, ${fresh.hash.slice(0, 12)}\n`);
    return;
  }
  await assemble(libDir);
  const { hash, count } = await hashTree(libDir);
  process.stdout.write(`built plugin lib/: ${count} files, ${hash.slice(0, 12)}\n`);
}

// Run the build only when invoked as a script, not when imported (e.g. by the
// license-closure regression, which calls computeLicenseClosure() directly).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    process.stderr.write(`build-plugin failed: ${e.message}\n`);
    process.exit(1);
  });
}
