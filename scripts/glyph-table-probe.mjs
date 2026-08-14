// Measure per-glyph ADVANCE (getComputedTextLength, not ink getBBox) for every
// printable ASCII char at the overview label face (13px / weight 600) in headless
// Chromium. Advance >= ink width, and the reviewer gate measures ink getBBox, so
// an advance-based per-glyph upper bound is a STRICTLY SAFE fit estimator.
import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext()).newPage();

// Measure marginal advance of one glyph: len(base+ch*n) - len(base) over n, using
// a leading anchor so interior-space advance is captured (getBBox would drop it).
async function advance(ch, n = 40) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const mk = (txt) => `<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="60"><text x="0" y="30" style="font:600 13px Inter,ui-sans-serif,system-ui" id="t">${esc(txt)}</text></svg>`;
  await page.setContent(`<!doctype html><meta charset=utf-8>${mk("I" + ch.repeat(n))}`, { waitUntil: "networkidle" });
  const full = await page.evaluate(() => document.getElementById("t").getComputedTextLength());
  await page.setContent(`<!doctype html><meta charset=utf-8>${mk("I")}`, { waitUntil: "networkidle" });
  const base = await page.evaluate(() => document.getElementById("t").getComputedTextLength());
  return (full - base) / n;
}

const arr = [];
let max = 0, worst = "";
for (let c = 0x20; c <= 0x7e; c++) {
  const ch = String.fromCharCode(c);
  const a = await advance(ch);
  arr.push(+a.toFixed(3));
  if (a > max) { max = a; worst = ch; }
}
const ell = await advance("…", 10);
await browser.close();

console.log("ELLIPSIS_ADVANCE", ell.toFixed(3));
console.log("MAX_ASCII", max.toFixed(3), JSON.stringify(worst));
console.log("ARRAY", JSON.stringify(arr));
