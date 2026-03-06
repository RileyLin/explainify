# CLAUDE.md — Explainify Codebase Context

## What is Explainify?
AI-powered tool that transforms complex technical content into beautiful, interactive web explainers. Paste a dense doc → get a shareable, animated, clickable micro-webpage that makes the concept click instantly.

**Think:** Brilliant.org quality meets Napkin.ai speed. Gamma-style "paste → polished output" but interactive, not slides.

## Core Architectural Insight
**The LLM generates structured JSON data, NOT code.** Our pre-built, hand-crafted React renderers interpret the JSON and produce polished interactive output. This gives us:
- Near-100% generation success rate (JSON is trivially validatable vs code)
- Consistent visual quality (we control the renderers)
- Instant template switching (same data, different renderer, zero LLM cost)
- LLM plays to its strength (understanding content, not writing bug-free React)

## Repo Structure
```
explainify/
├── CLAUDE.md              # This file — codebase context for AI agents
├── REQUIREMENTS.md        # Product requirements & specs
├── TASKS.md               # Task tracker with status
├── README.md              # Public-facing repo readme
├── package.json
├── next.config.ts
├── tsconfig.json
├── .env.example           # Required env vars template
├── src/
│   ├── app/               # Next.js App Router pages
│   │   ├── layout.tsx
│   │   ├── page.tsx             # Landing page
│   │   ├── create/
│   │   │   └── page.tsx         # Main creation flow (paste → generate → preview)
│   │   ├── e/[slug]/
│   │   │   └── page.tsx         # Published explainer viewer
│   │   ├── dashboard/
│   │   │   └── page.tsx         # User's explainers list
│   │   └── api/
│   │       ├── generate/
│   │       │   └── route.ts     # LLM analysis endpoint
│   │       └── publish/
│   │           └── route.ts     # Save & publish explainer
│   ├── components/
│   │   ├── ui/                  # Shared UI components (shadcn/ui)
│   │   ├── editor/              # Explainer editor/preview
│   │   ├── renderers/           # Template renderer components
│   │   │   ├── flow-animator.tsx       # React Flow + Motion (diagrams, flows)
│   │   │   ├── component-explorer.tsx  # React Flow + Motion (architecture)
│   │   │   ├── code-walkthrough.tsx    # Shiki + Motion (code tutorials)
│   │   │   ├── concept-builder.tsx     # Motion + Tailwind (layered concepts)
│   │   │   ├── compare-contrast.tsx    # Motion + Tailwind (side-by-side)
│   │   │   ├── decision-tree.tsx       # React Flow tree layout + Motion
│   │   │   ├── timeline.tsx            # Motion + Tailwind (sequential)
│   │   │   └── renderer-registry.ts    # Maps template names → renderer components
│   │   └── landing/             # Landing page sections
│   ├── lib/
│   │   ├── llm/
│   │   │   ├── analyzer.ts      # Content analysis → structured JSON (single LLM pass)
│   │   │   ├── prompts.ts       # System prompts per template type
│   │   │   └── client.ts        # Bedrock Claude client wrapper
│   │   ├── schemas/
│   │   │   ├── base.ts          # Shared schema types (ExplainerData)
│   │   │   ├── flow.ts          # Flow Animator JSON schema (Zod)
│   │   │   ├── explorer.ts      # Component Explorer JSON schema
│   │   │   ├── code.ts          # Code Walkthrough JSON schema
│   │   │   ├── concept.ts       # Concept Builder JSON schema
│   │   │   ├── compare.ts       # Compare & Contrast JSON schema
│   │   │   ├── decision.ts      # Decision Tree JSON schema
│   │   │   └── timeline.ts      # Timeline JSON schema
│   │   ├── db.ts                # Database client (Supabase)
│   │   └── utils.ts
│   └── styles/
│       └── globals.css
├── public/
│   └── assets/
└── tests/
```

## Tech Stack

### Foundation (every explainer)
- **Next.js 14+** (App Router, Server Components + Client Components)
- **TypeScript** (strict mode)
- **Tailwind CSS** + **shadcn/ui** (styling)
- **Motion** (formerly Framer Motion) — all animations, transitions, enter/exit

### Specialized Renderers (loaded per-template)
- **React Flow** (@xyflow/react) — node-based diagrams for Flow Animator, Component Explorer, Decision Tree templates
- **Shiki** — VS Code-quality syntax highlighting for Code Walkthrough template
- **Lucide React** — icons across all templates

### Backend
- **Claude via Amazon Bedrock** (us-west-2) — content analysis, JSON generation
- **Supabase** (PostgreSQL) — user data, explainer metadata, generated JSON storage
- **Zod** — schema validation for all LLM output

### Infrastructure
- **Vercel** or **AWS ECS Fargate** for hosting
- **Supabase Storage** or **S3** for published explainer JSON blobs
- **CloudFront** CDN for serving published explainers

## Rendering Architecture — JSON DSL Approach

### How It Works
```
User pastes content
    ↓
LLM (Claude) analyzes content
    ↓
Outputs structured JSON matching a Zod schema
    ↓
Our renderer registry picks the right React component
    ↓
Pre-built renderer interprets JSON → interactive explainer
```

### Library Usage Per Template

| Template | Libraries Used | What They Handle |
|----------|---------------|-----------------|
| Flow Animator | React Flow + Motion | Animated node diagrams with step-through |
| Component Explorer | React Flow + Motion | Clickable architecture with detail panels |
| Code Walkthrough | Shiki + Motion | Syntax highlighted code with annotations |
| Concept Builder | Motion + Tailwind | Progressive layers that animate in |
| Compare & Contrast | Motion + Tailwind | Side-by-side with animated toggles |
| Decision Tree | React Flow (tree layout) + Motion | Interactive branching paths |
| Timeline | Motion + Tailwind | Sequential expandable nodes |

### Why JSON DSL > Code Generation
1. **Reliability:** JSON is validatable with Zod. If invalid, targeted retry. No "missing semicolon breaks everything."
2. **Quality floor:** Renderers are hand-crafted and tested. Every explainer looks professional.
3. **Template switching:** Same JSON → different renderer → instant, zero LLM cost.
4. **Embeddable:** Output is JSON + renderer component. No sandbox/iframe needed. Embeds anywhere.
5. **LLM plays to strength:** LLMs understand content brilliantly. They write buggy interactive code. Let them do what they're good at.

### Example: Flow Animator JSON Schema
```typescript
// What the LLM outputs (validated by Zod):
{
  "template": "flow-animator",
  "title": "AgentCore Lambda Relay Flow",
  "summary": "How requests flow from client through Lambda relay to Bedrock",
  "steps": [
    {
      "id": "client",
      "label": "Client App",
      "description": "Sends inference request with auth headers",
      "icon": "monitor",
      "details": "The client app packages the prompt...",
      "codeSnippet": "await fetch('/api/invoke', { headers: { Authorization: token } })"
    },
    {
      "id": "lambda",
      "label": "Lambda Relay",
      "description": "SigV4 signing + request transformation",
      "icon": "function",
      "details": "Lambda handles the heavy lifting of AWS auth...",
      "codeSnippet": "const signed = await signV4(request);"
    }
  ],
  "connections": [
    { "from": "client", "to": "lambda", "label": "HTTPS POST", "animated": true }
  ],
  "theme": { "accentColor": "#3b82f6" }
}
```

Our `<FlowAnimator data={json} />` component renders this into a fully interactive, animated, pannable diagram. The LLM never touches React code.

## Environment Variables
```
# LLM
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=us-west-2
BEDROCK_MODEL_ID=us.anthropic.claude-sonnet-4-6-v1

# Database (Supabase)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # Server-side only, bypasses RLS

# Auth (NextAuth.js)
NEXTAUTH_SECRET=
NEXTAUTH_URL=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# Storage
AWS_S3_BUCKET=          # For published explainer bundles (optional — can use Supabase Storage)

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Coding Conventions
- Use Server Components by default; add "use client" only when needed (interactivity, hooks)
- Keep LLM prompts in `src/lib/llm/prompts.ts` — never inline them
- All LLM output validated through Zod schemas in `src/lib/schemas/`
- All API routes return typed responses using Zod schemas
- Error handling: try/catch with structured error responses, never swallow errors
- Renderer components receive typed JSON data as props — never raw strings
- Use `cn()` utility (clsx + tailwind-merge) for conditional classes
- Dynamic imports for heavy renderers (React Flow, Shiki) — don't bloat initial bundle

## Commands
```bash
npm run dev          # Start dev server (localhost:3000)
npm run build        # Production build
npm run lint         # ESLint
npm run test         # Run tests
```

## Known Constraints
- Bedrock Claude has ~200K context window — large docs may need chunking
- React Flow renders best at 1000x600px minimum — responsive design needs special handling on mobile
- Shiki loads language grammars on demand — first code render has ~100ms delay
- Free tier: 5 explainers/month per user (rate limit at API layer)
- Motion animations: use `layout` prop for smooth transitions, avoid heavy spring physics on mobile
- Total renderer bundle (all libs): ~150KB gzipped — but tree-shake so only used renderers ship to client
