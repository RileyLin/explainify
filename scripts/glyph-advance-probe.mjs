// Measure the worst-case per-glyph advance for the overview label face
// (.nlabel = 13px / weight 600, font stack Inter,ui-sans-serif,system-ui) in the
// SAME headless Chromium the reviewers use, so the fit bound is calibrated, not guessed.
import { chromium } from "playwright";

const ASCII = [];
for (let c = 0x20; c <= 0x7e; c++) ASCII.push(String.fromCharCode(c));
const WIDE = ["W", "M", "@", "%", "中", "文", "字", "😀", "👍", "—", "…"];

const svg = (ch, n) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="60"><text x="0" y="30" style="font:600 13px Inter,ui-sans-serif,system-ui" id="t">${ch.repeat(n).replace(/&/g,"&amp;").replace(/</g,"&lt;")}</text></svg>`;

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext()).newPage();

async function advance(ch, n = 20) {
  const html = `<!doctype html><meta charset=utf-8>${svg(ch, n)}`;
  await page.setContent(html, { waitUntil: "networkidle" });
  const w = await page.evaluate(() => document.getElementById("t").getBBox().width);
  return w / n;
}

let maxAscii = 0, worstAscii = "";
for (const ch of ASCII) {
  const a = await advance(ch);
  if (a > maxAscii) { maxAscii = a; worstAscii = ch; }
}
console.log(`max ASCII glyph advance @13px/600 = ${maxAscii.toFixed(3)}px  (glyph "${worstAscii}")`);
console.log("wide/unicode probes:");
for (const ch of WIDE) {
  const a = await advance(ch);
  console.log(`  "${ch}"  advance=${a.toFixed(3)}px`);
}
await browser.close();
