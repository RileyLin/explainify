// Task #50 REVISE proof: measure every overview .nlabel text bbox against its
// node box at 320/390/1440, the exact getBBox evidence the PM required.
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const FILE = process.argv[2] || "/tmp/label-stress.html";
const html = readFileSync(FILE, "utf8");
const VIEWPORTS = [320, 390, 1440];
const NODE_W = 320; // must match renderer
const NLABEL_X = 14;

const browser = await chromium.launch({ headless: true });
let failures = 0;
try {
  for (const w of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
    const page = await ctx.newPage();
    const consoleErrors = [];
    page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
    page.on("pageerror", (e) => consoleErrors.push(String(e.message || e)));
    await page.setContent(html, { waitUntil: "networkidle" });

    // Measure each label's rendered text bbox vs the node's own coordinate box.
    const measures = await page.evaluate(({ NODE_W, NLABEL_X }) => {
      const out = [];
      for (const t of document.querySelectorAll("text.nlabel")) {
        const bb = t.getBBox(); // user-space units within the SVG
        // The node box spans [0, NODE_W] in the <g> local frame; the label starts
        // at NLABEL_X. Overflow = how far the drawn text right edge passes the box.
        const rightEdge = bb.x + bb.width;
        const overflow = rightEdge - (NODE_W - 2); // 2u inner margin
        out.push({ text: t.textContent, x: +bb.x.toFixed(2), width: +bb.width.toFixed(2), rightEdge: +rightEdge.toFixed(2), overflow: +overflow.toFixed(2) });
      }
      return out;
    }, { NODE_W, NLABEL_X });

    // Document horizontal overflow too (the old-only check).
    const docOverflow = await page.evaluate(() => {
      const el = document.scrollingElement || document.documentElement;
      return el.scrollWidth - el.clientWidth;
    });

    console.log(`\n=== viewport ${w}px ===  docOverflow=${docOverflow}  consoleErrors=${consoleErrors.length}`);
    for (const m of measures) {
      const bad = m.overflow > 0.5;
      if (bad) failures++;
      console.log(`  [${bad ? "CLIP" : "ok  "}] right=${m.rightEdge} box=${NODE_W} overflow=${m.overflow}  "${m.text}"`);
    }
    if (consoleErrors.length) { failures++; console.log("  console errors:", consoleErrors); }
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(`\nRESULT: ${failures === 0 ? "PASS — every label fits its node box at all widths" : failures + " FAILURE(S)"}`);
process.exit(failures === 0 ? 0 : 1);
