# Explainify Polish Plan

## Files to Modify
1. `src/app/create/page.tsx` — FIX 1 + FIX 2
2. `src/app/page.tsx` — FIX 3
3. `src/app/dashboard/dashboard-client.tsx` — FIX 4

## FIX 1: Save Flow
- Add `useSession` from `next-auth/react`
- Change Publish button label to "Save & Share →"
- After publish success: show enhanced panel with "Saved to your dashboard" (if session), URL copy, "View in Dashboard →" link, embed code
- Remove "← Back to editor" button, replace with "New Explainer" that resets state
- Remove `ArrowLeft` from create page toolbar (keep the one at top as back to home)

## FIX 2: UI Clutter
1. Remove `editMode`, `setEditMode`, `Pencil` import, and the Edit toggle button entirely
2. Speed toggle: only show for `flow-animator` and `component-explorer`
3. Color picker: only show for `flow-animator`, `code-walkthrough`, `concept-builder`, `decision-tree`, `component-explorer` (hide for `compare-contrast`, `timeline`)
4. Error state on AI failure: show proper error + "Try again" button instead of mock data
   - Remove `getMockData`, all mock data constants, and `MockDataType`
   - On error: set result to null, show error with retry button
5. Keep template switcher (good UX)

## FIX 3: How It Works — Interactive
- Replace `HowItWorksSection` with interactive stepper component
- `useState` for `activeStep` (0,1,2)
- `useEffect` with `setInterval(3000)` auto-advance; clicking pauses and jumps
- `AnimatePresence` + `motion.div` with key for panel animation
- Each step: icon, title, description, mock UI preview
- Active dot: pulsing `motion.div` with scale animation

## FIX 4: Dashboard Links
- Make `explainer.title` a `<Link>` to `/e/[explainer.slug]`
- Show "Draft" badge when `is_public === false`

## Success Criteria
- `npm run build` passes with zero errors
- `npm run lint` passes with no errors in modified files
