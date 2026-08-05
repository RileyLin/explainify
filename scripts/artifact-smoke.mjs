// Chromium smoke for a generated session-explanation artifact (static file://).
// Asserts, at 320/390/1440: HTTP-equivalent load ok, no console/page errors, no
// horizontal overflow, brand present. Usage:
//   LD_LIBRARY_PATH=~/.local/share/chromium-runtime/root/usr/lib/x86_64-linux-gnu \
//     node /tmp/artifact-smoke.mjs /abs/path/to/index.html
import { chromium } from "playwright";
import { pathToFileURL } from "node:url";

const file = process.argv[2];
if (!file) { console.error("need artifact path"); process.exit(2); }
const url = pathToFileURL(file).href;

const VIEWPORTS = [
  { kind: "desktop", width: 1440, height: 900 },
  { kind: "mobile", width: 390, height: 844 },
  { kind: "mobile-narrow", width: 320, height: 640 },
];

const results = [];
const browser = await chromium.launch({ headless: true });
try {
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
    page.on("pageerror", (e) => pageErrors.push(String(e.message || e)));
    const resp = await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    const status = resp ? resp.status() : 0; // file:// often reports 0; treat non-error load as ok
    const overflow = await page.evaluate(() => {
      const el = document.scrollingElement || document.documentElement;
      return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
    });
    const hasOverflow = overflow.scrollWidth > overflow.clientWidth + 1;
    const bodyText = await page.evaluate(() => document.body.innerText || "");
    const brandPresent = /Explainify/i.test(bodyText) || /Explainify/i.test(await page.title());
    const ok = (status === 200 || status === 0) && consoleErrors.length === 0 && pageErrors.length === 0 && !hasOverflow && brandPresent;
    results.push({ viewport: vp.kind, status, consoleErrors: consoleErrors.length, pageErrors: pageErrors.length, hasOverflow, brandPresent, ok, firstConsoleError: consoleErrors[0] || null, firstPageError: pageErrors[0] || null });
    await context.close();
  }
} finally {
  await browser.close();
}
const allOk = results.every((r) => r.ok);
console.log(JSON.stringify({ url, allOk, results }, null, 2));
process.exit(allOk ? 0 : 1);
