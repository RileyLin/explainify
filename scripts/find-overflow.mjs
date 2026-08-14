import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const html = readFileSync(process.argv[2], "utf8");
const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ viewport: { width: 320, height: 900 } });
const p = await ctx.newPage();
await p.setContent(html, { waitUntil: "networkidle" });
const bad = await p.evaluate(() => {
  const vw = document.documentElement.clientWidth;
  const out = [];
  for (const el of document.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (r.right > vw + 0.5) out.push({ tag: el.tagName, cls: el.className?.toString?.().slice(0,40), right: +r.right.toFixed(1), vw });
  }
  return out.slice(0, 12);
});
console.log(JSON.stringify(bad, null, 1));
await b.close();
