# Flow Animator v2 — Animation Plan

## Files to Touch
1. `package.json` — add `dagre` + `@types/dagre`
2. `src/components/renderers/flow-animator.tsx` — all animation upgrades
3. `src/lib/llm/prompts.ts` — update `FLOW_ANIMATOR_PROMPT`

## Step-by-Step Implementation Plan

### Step 1: Install dagre
```
npm install dagre @types/dagre
```

### Step 2: Update flow-animator.tsx

#### 2a. Imports
- Add: `useEffect, useRef` (useRef already imported)
- Add: `import dagre from 'dagre'`
- Add: `getSmoothStepPath, EdgeProps, BaseEdge, useEdgesState, useNodesState` from `@xyflow/react`
- Add: `Play, Pause` from `lucide-react`
- Add: `useAnimationSpeed` from `@/components/editor/animation-speed`

#### 2b. Layer color helper
```ts
function getLayerColor(id: string): string {
  if (/client|user|browser|app/.test(id))          return '#94a3b8';
  if (/gateway|proxy|load|edge|cdn/.test(id))       return '#3b82f6';
  if (/auth|iam|cognito|token|key/.test(id))        return '#f59e0b';
  if (/lambda|function|worker|compute|service|api/.test(id)) return '#8b5cf6';
  if (/db|database|dynamo|redis|postgres|storage|s3/.test(id)) return '#10b981';
  if (/queue|sns|sqs|event|stream/.test(id))        return '#f97316';
  return '#3b82f6';
}
```

#### 2c. Dagre layout function
```ts
function computeDagreLayout(nodes: FlowNodeType[], connections: FlowConnection[]): Map<string, {x:number,y:number}>
```
- Creates dagre graph with `rankdir: TB`, `ranksep: 120`, `nodesep: 80`
- Sets each node with `width: 220, height: 80`
- Sets each edge from connections
- Runs `dagre.layout(g)`
- Returns Map<id, {x, y}> 

#### 2d. AnimatedPacketEdge component
```tsx
function AnimatedPacketEdge(props: EdgeProps & { data?: { isActive?: boolean; color?: string } })
```
- Use `getSmoothStepPath` to get path string
- Render `<BaseEdge>` for the base line
- When `data.isActive`, render SVG circle with `<animateMotion>`
- Circle fill = `data.color ?? '#3b82f6'`, r=5, drop-shadow filter
- `<animateMotion dur="0.4s" fill="freeze" repeatCount="1">`

#### 2e. CustomFlowNode — update colors
- Accept `accentColor` in node data
- Use `accentColor` for border-color, icon color when active

#### 2f. FlowAnimatorInner state additions
- `activeEdgeId: string | null` — which edge is animating packet
- `isPlaying: boolean` — autoplay state

#### 2g. dagre useMemo
- `const dagrePositions = useMemo(() => computeDagreLayout(data.nodes, data.connections), [data])`

#### 2h. rfNodes useMemo update
- Use `dagrePositions.get(n.id)` as default position
- Fall back to `n.position` if LLM provided one  
- Add `accentColor: getLayerColor(n.id)` to node data

#### 2i. rfEdges useMemo update
- Change type to use `AnimatedPacketEdge`
- Pass `data: { isActive: activeEdgeId === edge.id, color: getLayerColor(c.from) }`
- Use layer color for stroke when active

#### 2j. goStep() update
- Find edge between prevNode→nextNode (or reverse)
- Set `activeEdgeId` to matching edge id
- Clear after 450ms via setTimeout
- Pause autoplay if called manually

#### 2k. Autoplay useEffect
- `useEffect` watches `isPlaying`
- `setInterval` based on speed: slow=3000, normal=1800, fast=900
- On interval: call `goStep(1)` if not at last step; else `setIsPlaying(false)`
- Clear interval on cleanup or when `isPlaying` becomes false

#### 2l. Controls UI update
- Add Play/Pause button next to step counter
- Shows `▶` when not playing, `⏸` when playing

#### 2m. Transition Callout Card
- Below the ReactFlow canvas div, render `<motion.div>` 
- key=`activeStep` for re-animation
- Show when `activeStep > 0`
- Content: find edge from `stepOrder[activeStep-1]` to `stepOrder[activeStep]`
  - Show edge label if present
  - Show destination node's `details` if present
- `initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}`
- Style: dark bg, small text, rounded

#### 2n. nodeTypes update
- Add `AnimatedPacketEdge` to `edgeTypes`
- Register `edgeTypes` in `<ReactFlow>`

### Step 3: Update FLOW_ANIMATOR_PROMPT
- Change `3-8` to `4-8` nodes
- Add layer hint instruction for node ids
- Add `"animated": true` instruction for primary data flow
- Make `details` REQUIRED (2-3 sentences)

## Success Criteria
- `npm run build` passes with 0 errors
- `npm run lint` passes
- `npx tsc --noEmit` passes
- All 6 features implemented
