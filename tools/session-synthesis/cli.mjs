#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { featureFixture, debuggingFixture } from "./fixtures.mjs";
import { writeSessionArtifacts } from "./session-synthesis.mjs";

const [command, input, output = "session-explanation"] = process.argv.slice(2);
if (command !== "synthesize") {
  console.error("Usage: node tools/session-synthesis/cli.mjs synthesize <bundle.json|feature|debugging> [output-dir]");
  process.exit(2);
}
const bundle = input === "feature" ? featureFixture() : input === "debugging" ? debuggingFixture() : JSON.parse(await readFile(input, "utf8"));
console.log(JSON.stringify(await writeSessionArtifacts(bundle, output), null, 2));
