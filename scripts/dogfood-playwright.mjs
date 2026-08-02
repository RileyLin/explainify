// Task #17 deterministic browser regression layer.
// Runs against the REAL Next.js production server (not setContent), desktop +
// mobile, and asserts: HTTP ok, no console/page errors, no horizontal overflow,
// Explainify brand present, legacy "VizBrief" absent. Screenshots are written
// for reviewer inspection.
//
// Requires the user-local Chromium runtime on LD_LIBRARY_PATH:
//   LD_LIBRARY_PATH=~/.local/share/chromium-runtime/root/usr/lib/x86_64-linux-gnu \
//     node scripts/dogfood-playwright.mjs
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.DOGFOOD_BASE || "http://127.0.0.1:3100";
const OUT = process.env.DOGFOOD_OUT || "/tmp/dogfood-shots";
mkdirSync(OUT, { recursive: true });

const PAGES = [
  { name: "home", path: "/" },
  { name: "create", path: "/create" },
  { name: "pricing", path: "/pricing" },
  { name: "signin", path: "/auth/signin" },
  { name: "seo-blockchain", path: "/explain/blockchain" },
  { name: "seo-quantum", path: "/explain/quantum-physics" },
];

const VIEWPORTS = [
  { kind: "desktop", width: 1440, height: 900 },
  { kind: "mobile", width: 390, height: 844 },
];

const results = [];

const browser = await chromium.launch({ headless: true });
try {
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
    });
    for (const pg of PAGES) {
      const page = await context.newPage();
      const consoleErrors = [];
      const pageErrors = [];
      page.on("console", (m) => {
        if (m.type() === "error") consoleErrors.push(m.text());
      });
      page.on("pageerror", (e) => pageErrors.push(String(e.message || e)));

      const url = BASE + pg.path;
      const resp = await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
      const status = resp ? resp.status() : 0;

      // Responsive: no horizontal overflow (scrollWidth must fit viewport, +1px tolerance)
      const overflow = await page.evaluate(() => {
        const el = document.scrollingElement || document.documentElement;
        return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
      });
      const hasOverflow = overflow.scrollWidth > overflow.clientWidth + 1;

      const bodyText = await page.evaluate(() => document.body.innerText || "");
      const brandPresent = /Explainify/i.test(bodyText) ||
        (await page.title()).match(/Explainify/i) !== null;
      const legacyBrand = /VizBrief/i.test(bodyText);

      const shot = `${OUT}/${pg.name}-${vp.kind}.png`;
      await page.screenshot({ path: shot, fullPage: true });

      const ok =
        status === 200 &&
        consoleErrors.length === 0 &&
        pageErrors.length === 0 &&
        !hasOverflow &&
        brandPresent &&
        !legacyBrand;

      results.push({
        page: pg.name,
        viewport: vp.kind,
        status,
        consoleErrors: consoleErrors.length,
        pageErrors: pageErrors.length,
        hasOverflow,
        brandPresent,
        legacyBrand,
        shot,
        ok,
        firstConsoleError: consoleErrors[0] || null,
        firstPageError: pageErrors[0] || null,
      });
      await page.close();
    }
    await context.close();
  }
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(JSON.stringify({ base: BASE, out: OUT, total: results.length, failed: failed.length, results }, null, 2));
process.exit(failed.length === 0 ? 0 : 1);
