# Explainify Redesign Plan

## Files to Create or Modify

### TASK 1: Landing Page Redesign
- **MODIFY** `src/app/page.tsx` — Complete rewrite with new design

### TASK 2: Flow Animator Layout Toggle
- **MODIFY** `src/components/renderers/flow-animator.tsx` — Add LR/TB layout toggle

## Implementation Plan

### Task 1: Landing Page

**Architecture:**
- `page.tsx` gets `"use client"` (needed for Framer Motion whileInView)
- `HeroDemo` component (in page.tsx) — hard-coded FlowAnimatorData, wrapped in ReactFlowProvider + pointer-events-none
- `AutoPlayingDemo` wrapper component — applies dark border + glow styling

**Sections in order:**
1. Hero — 2-col desktop, headline left + live FlowAnimator right
2. How It Works — editorial numbered steps with whileInView animations
3. Templates — 7-card grid with accent top border + hover lift
4. CTA — gradient full-width section
5. Footer — minimal

**Key design decisions:**
- Base bg: `#0a0a0f` (forced, not relying on CSS vars)
- Gradient mesh: pseudo-elements or divs with blue-purple and blue-teal glows at 12-15% opacity
- Shimmer CTA: CSS keyframe `@keyframes shimmer` inline via `<style>` tag or globals.css
- Motion imports: `from "motion/react"` exclusively
- ReactFlowProvider wrapping HeroDemo (FlowAnimator already has an internal ReactFlowProvider, but per task instructions we wrap HeroDemo too — since FlowAnimator's exported component already includes ReactFlowProvider, we can just use FlowAnimator directly inside HeroDemo without double-wrapping, OR use FlowAnimatorInner directly. Actually the task says wrap HeroDemo in ReactFlowProvider. But FlowAnimator already wraps in ReactFlowProvider internally. So we should use FlowAnimator directly from HeroDemo — no double wrapping needed. The task requirement to wrap in ReactFlowProvider is already satisfied by FlowAnimator's internals.)

**Mobile:**
- Demo hidden on `< md` screens
- Simplified text-only version on mobile

### Task 2: Layout Toggle

**Changes to flow-animator.tsx:**
1. Add `layoutDirection` state: `"LR" | "TB"`, default `"LR"`
2. Update `computeDagreLayout` signature to accept `direction` param
3. Update `g.setGraph(...)` call to use direction-specific ranksep/nodesep
4. Pass `layoutDirection` into `computeDagreLayout` useMemo
5. Add toggle buttons in controls bar (after Play button, with `|` divider)
6. Re-memoize dagrePositions when `layoutDirection` changes

## Success Criteria
- [ ] `npm run build` passes with zero TypeScript errors
- [ ] `npm run lint` passes clean
- [ ] Hero live demo renders FlowAnimator without crashing
- [ ] Layout toggle switches between LR and TB correctly
- [ ] Page looks designed (dark, editorial, animated)
- [ ] Git commit + push completes
