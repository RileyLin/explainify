// Build a real-renderer overview HTML whose step/verification node labels are the
// exact adversarial cases task #51 requires: W×34, M×34, PM's two labels, codex's
// wide symbol labels, a Unicode-wide case, and ordinary short text. Renders via the
// SAME synthesizeSession → renderSessionHtmlV2 path the plugin ships, then we
// overwrite only the drawn node labels (the fit treatment is applied at render).
import { buildChangeStory } from "../tools/session-synthesis/change-story.mjs";
import { renderSessionHtmlV2 } from "../tools/session-synthesis/change-story.mjs";
import { readFileSync, writeFileSync } from "node:fs";

const bundlePath = process.argv[2];
const outPath = process.argv[3] || "/tmp/label-stress-r3.html";
const bundle = JSON.parse(readFileSync(bundlePath, "utf8"));
const story = buildChangeStory(bundle);

const STRESS = [
  "W".repeat(34),
  "M".repeat(34),
  "Add 2 tests: normalizeLabels removes duplicates and trims whitespace",
  "Passing check: npm test 2>&1 (3/3 passed across suites verbose)",
  "@".repeat(40),
  "中".repeat(50),
  "Add square helper", // ordinary short — must stay natural
];

const stepNodes = story.overview.nodes.filter((n) => n.kind === "step" || n.kind === "verification");
let i = 0;
for (const n of stepNodes) {
  if (i < STRESS.length) n.label = STRESS[i++];
}
// If the story has fewer step/verification nodes than stress cases, append synthetic
// step nodes carrying the remaining labels so every adversarial case is drawn.
while (i < STRESS.length) {
  const base = stepNodes[stepNodes.length - 1] || story.overview.nodes.find((n) => n.kind === "step");
  const clone = JSON.parse(JSON.stringify(base));
  clone.id = `n:step:stress-${i}`;
  clone.label = STRESS[i++];
  story.overview.nodes.push(clone);
}

const html = renderSessionHtmlV2({ workstreamId: "w", checkpointId: "c", brief: {} }, story);
writeFileSync(outPath, html);
console.log(`wrote ${outPath}; stressed labels: ${STRESS.length}`);
