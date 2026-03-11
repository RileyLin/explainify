# Dogfood Report — Explainify
**Date:** 2026-03-11  
**Tester:** Kit (automated dogfood session)  
**Target:** https://explainify.driftworks.dev  
**Scope:** Full app — landing, create, publish, pricing, auth, explainer viewer  

---

## Summary

| Severity | Count |
|----------|-------|
| 🔴 Critical | 1 |
| 🟠 High | 3 |
| 🟡 Medium | 4 |
| 🔵 Low | 3 |
| **Total** | **11** |

---

## ISSUE-001 🔴 Critical — Mermaid Input Stale Closure (FIXED)
**Status:** ✅ Fixed in commit 7fbb587  
**Component:** `/src/app/create/page.tsx`  
**Description:** `handleGenerate` useCallback had deps `[content, template]` — missing `inputMode` and `mermaidContent`. Any mermaid diagram you typed was ignored; the function always used the initial placeholder value.  
**Fix:** Added `inputMode` and `mermaidContent` to deps array.  
**Mermaid tolerance:** The analyzer is reasonably tolerant — it accepts valid and slightly malformed mermaid. It uses the `[MERMAID_IMPORT]` prefix to force `flow-animator` template and appends conversion instructions to the LLM prompt. It does NOT do native mermaid parsing — it passes the raw text to Claude and asks it to convert, so fuzzy/partial diagrams should work fine.

---

## ISSUE-002 🔴 Critical — Download PNG Missing from Create Page (FIXED)
**Status:** ✅ Fixed in commit 7fbb587  
**Component:** `/src/app/create/page.tsx`  
**Description:** After generating a diagram on the create page, there was no Download PNG button. The button only existed on the published `/e/[slug]` viewer. Users had to publish before they could download.  
**Fix:** Added a `handleDownloadPng` function that auto-saves the explainer privately if no slug exists yet, then triggers the PNG export. Button appears in the result action bar alongside Save/Share/New.

---

## ISSUE-003 🟠 High — Branding: "Built by Riley" in Footer (FIXED)
**Status:** ✅ Fixed in commit 7fbb587  
**Component:** `/src/app/page.tsx` footer  
**Description:** Landing page footer showed "Explainify · Built by Riley" — personal branding, not company branding.  
**Fix:** Changed to "Explainify · Driftworks, Inc"  
**Note:** Change is in git/Vercel deploy queue. Live site still shows old text until Vercel rebuild completes.

---

## ISSUE-004 🟠 High — Terms & Privacy Links are Dead ("#" hrefs)
**Status:** ❌ Not fixed  
**Page:** `/auth/signin`  
**Description:** Sign-in page footer has "Terms" and "Privacy Policy" links both pointing to `href="#"`. Clicking them does nothing. This is a legal/trust problem — users are asked to agree to terms they can't read.  
**Fix needed:** Either create `/terms` and `/privacy` pages, or link to external Driftworks legal pages.

---

## ISSUE-005 🟠 High — 404 Page Has No Recovery Path
**Status:** ❌ Not fixed  
**Page:** Any nonexistent URL (e.g. `/terms`, `/nonexistent`)  
**Description:** The 404 page is Next.js default — no nav header, no "Go Home" button, no Explainify branding. Users who land on a bad URL are stranded.  
**Repro:** Visit https://explainify.driftworks.dev/terms  
**Fix needed:** Create `src/app/not-found.tsx` with header + "Go Home" CTA.

---

## ISSUE-006 🟠 High — Pricing Inconsistency: Skill says $15/mo, Page says $9/mo
**Status:** ❌ Not fixed  
**Pages:** `/pricing`, `skills/explainify/SKILL.md`  
**Description:** The pricing page shows Pro at $9/month. The Explainify API skill doc says "$15/mo". These are out of sync — if someone reads the skill doc they'll expect $15.  
**Fix needed:** Update `skills/explainify/SKILL.md` to reflect current $9/mo pricing.

---

## ISSUE-007 🟡 Medium — Template Count Inconsistency: Landing Says 8, Create Has 9
**Status:** ❌ Not fixed  
**Pages:** `/` (templates section), `/create`  
**Description:** Landing page template section header says "The right format for every doc" and lists 8 templates. The create page has 9 buttons (includes "⚛️ Concept Map" / `molecule` renderer). The molecule template is invisible to users browsing the landing page.  
**Fix needed:** Either add molecule to the landing page templates grid, or if it's experimental, remove it from the create page selector.

---

## ISSUE-008 🟡 Medium — "Concept Map" Template Label Mismatch
**Status:** ❌ Not fixed  
**Pages:** `/create`  
**Description:** The create page shows "⚛️ Concept Map" as a template option, but internally the template is named `molecule`. The CLAUDE.md schema docs and API skill docs reference `molecule` but the UI calls it "Concept Map." Inconsistency between user-facing name and internal/API name could confuse developers building on top of the API.  
**Fix needed:** Decide on canonical name and update all references.

---

## ISSUE-009 🟡 Medium — CSS Preload Warning (Performance)
**Status:** ❌ Not fixed  
**Page:** Homepage  
**Console warning:** `The resource /_next/static/chunks/8a5bd6fe3abc8091.css was preloaded using link preload but not used within a few seconds`  
**Description:** A CSS chunk is being preloaded but not used on initial load. Minor performance hit — unnecessary preload bandwidth.  
**Fix:** Next.js may auto-resolve on rebuild. If persistent, investigate which page triggers the preload.

---

## ISSUE-010 🟡 Medium — No "Create" Page Title in Browser Tab
**Status:** ❌ Not fixed  
**Page:** `/create`  
**Description:** Browser tab shows "Explainify — Paste complexity. Get clarity." on ALL pages including `/create`. The create page should have a more specific title like "Create Explainer — Explainify" for better UX and SEO.  
**Fix needed:** Add `export const metadata` to `src/app/create/page.tsx` — but it's a client component. Use `generateMetadata` approach or move metadata to a layout.

---

## ISSUE-011 🔵 Low — Sign-in Page: "Sign In" Button in Header is Redundant
**Status:** ❌ Not fixed  
**Page:** `/auth/signin`  
**Description:** The sign-in page still shows the "Sign In" button in the header nav — which just navigates to the same page the user is already on. Minor UX awkwardness.

---

## ISSUE-012 🔵 Low — Hero Demo Diagram Not Labeled as Interactive
**Status:** ❌ Not fixed  
**Page:** `/` (homepage hero)  
**Description:** The homepage shows a live React Flow demo diagram but nothing indicates it's interactive/clickable. Users might not realize they can pan, zoom, and click nodes. A subtle "Interactive — try clicking a node" hint would help conversion.

---

## ISSUE-013 🔵 Low — Favicon is Default Next.js Triangle
**Status:** ⏳ Pending logo choice from Ryan  
**Description:** Browser tab shows the default Next.js favicon (triangle icon). No Explainify/Driftworks branding. 3 logo concepts have been generated and sent to Ryan for review.

---

## Pages Tested
- ✅ `/` — Homepage
- ✅ `/create` — Create page (input + result flow)
- ✅ `/pricing` — Pricing page
- ✅ `/auth/signin` — Sign-in page
- ✅ `/e/8cdkxda4` — Published explainer viewer
- ✅ `/dashboard` → redirects correctly to sign-in
- ✅ `/terms` → 404 (confirms ISSUE-004)
- ✅ Non-existent page → 404 (confirms ISSUE-005)

