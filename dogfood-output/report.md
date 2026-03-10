# Dogfood Report — Explainify
**Date:** 2026-03-10  
**Target:** https://explainify.driftworks.dev  
**Tester:** Kit (agent-browser dogfood)

---

## Summary
| Severity | Count |
|----------|-------|
| 🔴 Critical | 0 |
| 🟠 Major | 2 |
| 🟡 Minor | 5 |
| 💡 UX Suggestion | 3 |

---

## Issues

### 🟠 MAJOR-1: Pricing says "7 template types" but we have 8
**Page:** /pricing  
**Repro:** Navigate to pricing page → read Free tier features  
**Expected:** "All 8 template types" (flow, molecule, code-walkthrough, concept, compare, decision-tree, timeline, component-explorer)  
**Actual:** "All 7 template types"  
**Screenshot:** screenshots/pricing.png  

### 🟠 MAJOR-2: Minimal node style (TB + Compact) — nodes too small and overlap
**Page:** Create page → Flow Diagram result  
**Repro:** Generate a flow → click TB → click Compact → click Minimal nodes  
**Expected:** Nodes rearrange cleanly in compact TB layout  
**Actual:** Nodes are extremely small, text barely readable, nodes overlap in compact TB mode  
**Screenshot:** screenshots/flow-minimal.png  

### 🟡 MINOR-1: Generate button unresponsive when textarea is empty
**Page:** /create  
**Repro:** Click "Generate Explainer" without entering any content  
**Expected:** Error message like "Please paste some content first"  
**Actual:** Button click does nothing (no error, no feedback). Times out on automation.  
**Screenshot:** screenshots/empty-submit.png  

### 🟡 MINOR-2: All molecule nodes show "SERVICE" badge regardless of concept type
**Page:** /e/wp9urzfk (Machine Learning Concepts)  
**Repro:** View the molecule concept map  
**Expected:** Different badge labels per concept (e.g., CONCEPT, METHOD, TECHNIQUE)  
**Actual:** Every single node shows "SERVICE" badge — inappropriate for non-service concepts  
**Screenshot:** screenshots/view-molecule.png  

### 🟡 MINOR-3: Connection labels overlap on molecule when nodes are close
**Page:** /e/wp9urzfk  
**Repro:** View connection labels between center node and surrounding nodes  
**Expected:** Labels readable and non-overlapping  
**Actual:** "Labeled Data", "Pretrained Models", "Unlabeled Data" labels overlap near center node  
**Screenshot:** screenshots/view-molecule.png  

### 🟡 MINOR-4: Flow diagram step counter shows "1/7" but step < > buttons have no label/tooltip
**Page:** Create page → Flow result  
**Repro:** Look at step navigation controls  
**Expected:** Previous/Next buttons have aria-label or tooltip  
**Actual:** Buttons show as bare chevrons with no accessible label  

### 🟡 MINOR-5: Settings bar density icons have no visual indicator of current state
**Page:** All diagram views  
**Repro:** Look at the compact/normal/spread density toggle  
**Expected:** Active state is visually distinct  
**Actual:** The 3 density icons (↗ □ ↙) are hard to distinguish which is active — the highlight is subtle  

---

## UX Suggestions

### 💡 SUG-1: Add confirmation/toast when "Copy Link" is clicked
Currently clicking "Copy Link" provides no visual feedback that the URL was copied.

### 💡 SUG-2: Molecule should show a detail panel when clicking node (not just highlight)
The molecule view says "Click any node to explore it" but clicking only highlights — on the view page there's no visible detail panel appearing (it may be scrolled below the fold).

### 💡 SUG-3: Create page should remember last-used template
When creating multiple explainers, having to re-select the template each time is friction. Consider remembering the last choice in localStorage.

---

## What's Working Well ✅
- All 8 template types generate successfully
- Settings bar renders on all diagram types (flow, molecule, timeline, compare)
- LR/TB toggle works instantly on flow
- Density toggle works on flow/molecule/timeline  
- Labels/Details toggles work on flow
- Share buttons (X, LinkedIn, Copy Link, Remix) all present
- Download PNG button present and clickable
- Pricing page clean with clear Free/Pro tiers
- Zero console errors across all pages tested
- Page load times fast (~1-2s for static, ~10-15s for generation)
