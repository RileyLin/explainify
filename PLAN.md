# VizBrief Deep Dive Feature — Implementation Plan

## Tickets: RIL-79, RIL-80, RIL-81

## Overview
Add "fractal deep dive" to VizBrief: clicking any node generates a deeper explainer on that sub-topic.
Three main pieces: API + migration (RIL-79), Explore buttons on all 7 renderers (RIL-80), breadcrumb navigation (RIL-81).

---

## Files to Create

| File | Purpose |
|------|---------|
| `supabase/migrations/004_deep_dive.sql` | Add parent_slug + source_node_id columns |
| `src/app/api/v1/deep-dive/route.ts` | POST endpoint for deep dive generation |
| `src/lib/llm/deep-dive-prompt.ts` | Specialized system prompt for deeper explainers |
| `src/components/renderers/explore-button.tsx` | Shared amber "Explore ↗" button component |
| `src/components/viewer/breadcrumb.tsx` | Sticky breadcrumb navigation component |

## Files to Modify

| File | Change |
|------|--------|
| `src/lib/db.ts` | Add parent_slug + source_node_id to ExplainerRow interface |
| `src/components/renderers/timeline.tsx` | Add ExploreButton on each event |
| `src/components/renderers/flow-animator.tsx` | Add ExploreButton on each step node |
| `src/components/renderers/concept-builder.tsx` | Add ExploreButton on each layer |
| `src/components/renderers/component-explorer.tsx` | Add ExploreButton on each component |
| `src/components/renderers/compare-contrast.tsx` | Add ExploreButton on each item |
| `src/components/renderers/decision-tree.tsx` | Add ExploreButton on each decision node |
| `src/components/renderers/code-walkthrough.tsx` | Add ExploreButton on each code block |
| `src/app/e/[slug]/page.tsx` | Fetch parent chain from DB, pass to client |
| `src/app/e/[slug]/explainer-client.tsx` | Render breadcrumb above viewer |

---

## Implementation Steps

### Step 1: DB Migration (004_deep_dive.sql)
- ALTER TABLE explainers ADD COLUMN parent_slug TEXT
- ALTER TABLE explainers ADD COLUMN source_node_id TEXT
- CREATE INDEX on parent_slug for efficient parent chain lookups
- Update ExplainerRow interface in db.ts

### Step 2: Deep Dive Prompt (deep-dive-prompt.ts)
- System prompt that instructs LLM to go DEEPER on a specific sub-topic
- Receives full source content + nodeTitle + nodeDescription
- Uses AUTO_DETECT to pick best template for the sub-topic
- Produces complementary, not repetitive, content

### Step 3: Deep Dive API Route (route.ts)
- POST /api/v1/deep-dive
- Request: { slug, nodeId, nodeTitle, nodeDescription, template? }
- No auth required (public like viewing)
- Rate limiting: IP-based in-memory counter, 10 requests/hour
- Fetches parent source_content from DB
- Calls analyzeContent() with specialized prompt
- Saves to DB with parent_slug + source_node_id
- Returns { url, slug, data, parentSlug }

### Step 4: ExploreButton Component
- "use client"
- Props: nodeId, nodeTitle, nodeDescription, parentSlug
- Reads current URL slug from usePathname() 
- On click: POST to /api/v1/deep-dive, then router.push() to new URL
- Visual: amber-500 pill "Explore ↗"
- Loading: pulsing dots (Framer Motion)
- Mobile: always visible (no hover required), icon-only on small screens
- Desktop: only visible on group-hover

### Step 5: Add ExploreButton to All 7 Renderers
For each renderer, wrap each interactive node in `group relative` and place ExploreButton.

**Timeline**: each event div gets `group` class, ExploreButton renders in content area
**FlowAnimator**: ExploreButton in CustomFlowNode (positioned absolutely top-right)
**ConceptBuilder**: ExploreButton in LayerCard component
**ComponentExplorer**: ExploreButton positioned inside ExplorerNode
**CompareContrast**: ExploreButton in item header area
**DecisionTree**: ExploreButton in current node card (per visible decision)
**CodeWalkthrough**: ExploreButton on code block tab/header

### Step 6: Breadcrumb Component
- "use client"
- Props: parentSlug, parentTitle, nodeName, currentTitle, appUrl
- Only renders when parentSlug is present
- Shows: ← Parent / NodeName / Current
- Each segment is a clickable link
- Sticky at top, stone-50 bg, border-bottom stone-200
- Small text (text-xs/text-sm)
- Motion animate-in

### Step 7: Modify Page & Client
- page.tsx: fetch parent explainer when parent_slug exists, pass parentTitle + sourcNodeId to client
- explainer-client.tsx: receive parent info props, render Breadcrumb above ExplainerViewer

---

## Success Criteria
1. ✅ Migration SQL adds parent_slug + source_node_id without errors
2. ✅ POST /api/v1/deep-dive returns { url, slug, data, parentSlug }
3. ✅ Explore button appears on hover over every node in all 7 renderers
4. ✅ Clicking Explore generates a new explainer and navigates to it
5. ✅ Breadcrumb shows "← Parent / Node / Current" when parent_slug exists
6. ✅ Deep dives have their own shareable URLs
7. ✅ Recursive deep-diving works (explainer of an explainer of an explainer)
8. ✅ npm run build passes with no TypeScript errors
9. ✅ npm run lint passes cleanly

---

## Design Constraints (NON-NEGOTIABLE)
- Explore button: amber-500, only on hover (always visible mobile)
- Loading state: pulsing amber dots via Framer Motion
- Breadcrumb: stone-50 bg, text-xs, border-bottom stone-200
- No generic spinners
- Mobile responsive
