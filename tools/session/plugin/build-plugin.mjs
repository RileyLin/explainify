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
// ${CLAUDE_PLUGIN_ROOT} alone. No node_modules, no network, no build step at
// install time. `--check` re-runs the build into a temp dir and byte-compares,
// failing if the committed lib/ has drifted from canonical source (drift guard).

import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import { mkdir, readFile, writeFile, rm, readdir, stat } from "node:fs/promises";
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
  const bin = join(REPO, "node_modules", ".bin", "esbuild");
  return bin;
}

// The third-party packages bundled into lib/vendor/mcp-vendor.mjs. Their license
// notices are reproduced verbatim in lib/vendor/LICENSES.md so the redistributed
// bundle carries the attribution its MIT licenses require.
const VENDORED_DEPS = ["@modelcontextprotocol/sdk", "zod"];

async function buildVendorBundle(libDir) {
  // Emit a tiny entry inside the repo (so esbuild resolves node_modules), bundle
  // the two runtime deps into one ESM file, then remove the entry.
  const entryPath = join(HERE, ".vendor-entry.mjs");
  const entrySrc = [
    'export { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";',
    'export { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";',
    'export { z } from "zod";',
    "",
  ].join("\n");
  await writeFile(entryPath, entrySrc, "utf8");
  try {
    const outFile = join(libDir, "vendor", "mcp-vendor.mjs");
    await mkdir(dirname(outFile), { recursive: true });
    execFileSync(
      esbuildBin(),
      [
        entryPath,
        "--bundle",
        "--platform=node",
        "--format=esm",
        "--target=node20",
        "--external:node:*",
        `--outfile=${outFile}`,
      ],
      { cwd: REPO, stdio: ["ignore", "ignore", "inherit"] },
    );
  } finally {
    await rm(entryPath, { force: true });
  }
  await writeLicenseNotices(libDir);
}

async function writeLicenseNotices(libDir) {
  const sections = [
    "# Third-party licenses",
    "",
    "The bundled runtime `mcp-vendor.mjs` includes the following packages. Their",
    "license texts are reproduced verbatim below. This file is generated by",
    "`build-plugin.mjs`; do not edit by hand.",
    "",
  ];
  for (const dep of VENDORED_DEPS) {
    const pkgJson = JSON.parse(await readFile(join(REPO, "node_modules", dep, "package.json"), "utf8"));
    let text = "";
    for (const name of ["LICENSE", "LICENSE.md", "LICENSE.txt", "license", "LICENSE-MIT"]) {
      try {
        text = await readFile(join(REPO, "node_modules", dep, name), "utf8");
        break;
      } catch {
        /* try next candidate */
      }
    }
    if (!text) {
      throw new Error(`No LICENSE file found for vendored dependency ${dep}; cannot ship the bundle without its notice.`);
    }
    sections.push(`## ${dep} ${pkgJson.version} (${pkgJson.license || "see below"})`, "", "```", text.trimEnd(), "```", "");
  }
  await writeFile(join(libDir, "vendor", "LICENSES.md"), sections.join("\n"), "utf8");
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

main().catch((e) => {
  process.stderr.write(`build-plugin failed: ${e.message}\n`);
  process.exit(1);
});
