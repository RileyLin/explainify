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
  // 320px is the narrowest widely-supported mobile width. The prior gate only
  // checked 390px and missed a header overflow where the Sign In button was
  // clipped outside a 320px viewport (task #17 REVISE).
  { kind: "mobile-narrow", width: 320, height: 640 },
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

      // Header clip check: every interactive control in the sticky header must
      // fit inside the viewport. A control can be clipped (right edge past the
      // viewport) even when page scrollWidth looks fine, so assert per-element.
      // (task #17 320px Sign In clip.)
      const headerClip = await page.evaluate((vw) => {
        const header = document.querySelector("header");
        if (!header) return { checked: 0, clipped: [] };
        const controls = header.querySelectorAll("a, button");
        const clipped = [];
        for (const el of controls) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) continue; // not rendered
          if (r.right > vw + 1 || r.left < -1) {
            clipped.push({
              text: (el.getAttribute("aria-label") || el.innerText || "").trim().slice(0, 24),
              right: Math.round(r.right),
              left: Math.round(r.left),
            });
          }
        }
        return { checked: controls.length, clipped };
      }, vp.width);
      const hasHeaderClip = headerClip.clipped.length > 0;

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
        !hasHeaderClip &&
        brandPresent &&
        !legacyBrand;

      results.push({
        page: pg.name,
        viewport: vp.kind,
        status,
        consoleErrors: consoleErrors.length,
        pageErrors: pageErrors.length,
        hasOverflow,
        hasHeaderClip,
        clippedControls: headerClip.clipped,
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

// ── Navigation discoverability (task #17 REVISE) ─────────────────────────
// A direct-URL 200 is not enough: a normal user browsing from the homepage must
// be able to FIND and CLICK entry points to Pricing / Privacy / Terms on both
// desktop and mobile. Assert each link is visible from "/" and navigates to the
// right route by clicking it (no typing the URL).
const NAV_TARGETS = [
  { name: "pricing", path: "/pricing", pattern: /\/pricing\/?$/ },
  { name: "privacy", path: "/privacy", pattern: /\/privacy\/?$/ },
  { name: "terms", path: "/terms", pattern: /\/terms\/?$/ },
];

const navResults = [];
const navBrowser = await chromium.launch({ headless: true });
try {
  for (const vp of VIEWPORTS) {
    for (const target of NAV_TARGETS) {
      const context = await navBrowser.newContext({
        viewport: { width: vp.width, height: vp.height },
      });
      const page = await context.newPage();
      let visible = false;
      let navigatedTo = null;
      let error = null;
      try {
        await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 30000 });
        // The link must be a real, visible, clickable element reachable from "/".
        const link = page.locator(`a[href="${target.path}"]:visible`).first();
        visible = (await link.count()) > 0 && (await link.isVisible());
        if (visible) {
          await link.click();
          // Next.js <Link> does a client-side push, so waiting on "networkidle"
          // races the router. Wait explicitly for the URL to become the target.
          try {
            await page.waitForURL(target.pattern, { timeout: 15000 });
          } catch {
            // fall through; navigatedTo below records where we actually landed
          }
          await page.waitForLoadState("networkidle", { timeout: 30000 });
          navigatedTo = new URL(page.url()).pathname;
        }
      } catch (e) {
        error = String(e.message || e);
      }
      const ok = visible && navigatedTo !== null && target.pattern.test(navigatedTo);
      navResults.push({
        target: target.name,
        viewport: vp.kind,
        visibleFromHome: visible,
        navigatedTo,
        ok,
        error,
      });
      await context.close();
    }
  }
} finally {
  await navBrowser.close();
}

const failed = results.filter((r) => !r.ok);
const navFailed = navResults.filter((r) => !r.ok);
console.log(JSON.stringify({
  base: BASE,
  out: OUT,
  total: results.length,
  failed: failed.length,
  results,
  navTotal: navResults.length,
  navFailed: navFailed.length,
  navResults,
}, null, 2));
process.exit(failed.length === 0 && navFailed.length === 0 ? 0 : 1);
