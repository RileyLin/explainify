# CLAUDE.md — Explainify Codebase Context

## What is Explainify?
AI-powered tool that transforms complex technical content into beautiful, interactive web explainers. Paste a dense doc → get a shareable, animated, clickable micro-webpage that makes the concept click instantly.

**Think:** Brilliant.org quality meets Napkin.ai speed. Gamma-style "paste → polished output" but interactive, not slides.

## Repo Structure
```
explainify/
├── CLAUDE.md            # This file — codebase context for AI agents
├── REQUIREMENTS.md      # Product requirements & specs
├── TASKS.md             # Task tracker with status
├── README.md            # Public-facing repo readme
├── package.json
├── next.config.js
├── tsconfig.json
├── .env.example         # Required env vars template
├── prisma/
│   └── schema.prisma    # Database schema
├── src/
│   ├── app/             # Next.js App Router pages
│   │   ├── layout.tsx
│   │   ├── page.tsx           # Landing page
│   │   ├── create/
│   │   │   └── page.tsx       # Main creation flow (paste → generate → preview)
│   │   ├── e/[slug]/
│   │   │   └── page.tsx       # Published explainer viewer
│   │   ├── dashboard/
│   │   │   └── page.tsx       # User's explainers list
│   │   └── api/
│   │       ├── generate/
│   │       │   └── route.ts   # LLM pipeline endpoint
│   │       ├── publish/
│   │       │   └── route.ts   # Save & publish explainer
│   │       └── auth/
│   │           └── [...nextauth]/route.ts
│   ├── components/
│   │   ├── ui/                # Shared UI components (shadcn/ui)
│   │   ├── editor/            # Explainer editor/preview
│   │   ├── templates/         # Interactive template components
│   │   └── landing/           # Landing page sections
│   ├── lib/
│   │   ├── llm/
│   │   │   ├── analyzer.ts    # Pass 1: Content analysis → structured JSON
│   │   │   ├── generator.ts   # Pass 2: Structure + template → React code
│   │   │   └── prompts.ts     # System prompts for each pass
│   │   ├── templates/
│   │   │   ├── registry.ts    # Template registry & metadata
│   │   │   ├── flow-animator.tsx
│   │   │   ├── component-explorer.tsx
│   │   │   ├── code-walkthrough.tsx
│   │   │   ├── concept-builder.tsx
│   │   │   ├── compare-contrast.tsx
│   │   │   ├── decision-tree.tsx
│   │   │   └── timeline.tsx
│   │   ├── db.ts              # Prisma client
│   │   └── utils.ts
│   └── styles/
│       └── globals.css
├── public/
│   └── assets/
└── tests/
```

## Tech Stack
- **Framework:** Next.js 14+ (App Router, Server Actions)
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS + shadcn/ui
- **Database:** Supabase (PostgreSQL) via Prisma ORM
- **Auth:** NextAuth.js (GitHub + Google providers)
- **LLM:** Claude via Amazon Bedrock (us-west-2) — two-pass pipeline
- **Rendering:** Sandpack (CodeSandbox) for sandboxed iframe preview of generated components
- **Hosting:** Vercel (frontend) or self-hosted on AWS (ECS Fargate)
- **Storage:** S3 for generated explainer code bundles
- **CDN:** CloudFront for published explainer delivery

## Core Architecture — The Two-Pass LLM Pipeline

### Pass 1: Content Analyzer
- Input: Raw pasted content (markdown, text, code, HTML)
- Output: Structured JSON with:
  - `contentType`: "architecture" | "api" | "concept" | "tutorial" | "comparison" | "workflow"
  - `concepts[]`: Key concepts with definitions and relationships
  - `flow[]`: Sequential steps if applicable
  - `hierarchy`: Parent-child concept tree
  - `codeBlocks[]`: Extracted code with annotations
  - `suggestedTemplate`: Which interaction pattern fits best
  - `title`, `summary`, `difficulty`

### Pass 2: Component Generator
- Input: Structured JSON from Pass 1 + selected template
- Output: Self-contained React component code (TSX + inline Tailwind)
- The component follows the template's interaction pattern but is filled with the specific content
- Must be sandboxable (no external deps beyond React + Tailwind + Framer Motion)

### Why Two Passes?
Single-pass "generate interactive HTML from this text" produces wildly inconsistent results. Separating analysis from generation means:
1. We can validate/edit the analysis before generating
2. Users can swap templates without re-analyzing
3. We can cache analyses and regenerate with different templates cheaply
4. Quality is more predictable — the template constrains the output

## Template System

Templates are the core differentiator. Each template is:
1. A React component with well-defined props interface
2. A set of interaction patterns (click, hover, step-through, toggle, expand)
3. Animation presets (Framer Motion)
4. A prompt fragment that tells the LLM how to structure content for this template

### Current Templates (Priority Order)
1. **Flow Animator** — Step-through with animated arrows. For: request flows, pipelines, processes
2. **Component Explorer** — Clickable diagram with detail panels. For: architecture, system design
3. **Code Walkthrough** — Line-by-line annotation with highlights. For: code explanations
4. **Concept Builder** — Start simple, layer complexity. For: abstract concepts, mental models
5. **Compare & Contrast** — Side-by-side with toggle/slider. For: tradeoffs, alternatives
6. **Decision Tree** — Interactive branching. For: choosing between options
7. **Timeline** — Sequential expandable nodes. For: processes, history, evolution

## Key Design Decisions
- **Templates over raw code gen:** LLM fills data into proven interaction patterns rather than generating arbitrary JS. Consistent quality > creative freedom.
- **Sandboxed rendering:** Generated code runs in iframes via Sandpack. Security + embeddability.
- **React components, not static HTML:** React gives us state management for interactivity without complexity.
- **Tailwind inline:** No external CSS deps. Everything in one self-contained file.
- **Framer Motion for animations:** Declarative, React-native, good defaults.

## Environment Variables
```
# LLM
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=us-west-2
BEDROCK_MODEL_ID=us.anthropic.claude-sonnet-4-6-v1

# Database
DATABASE_URL=           # Supabase PostgreSQL connection string

# Auth
NEXTAUTH_SECRET=
NEXTAUTH_URL=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Storage
AWS_S3_BUCKET=          # For published explainer bundles
CLOUDFRONT_DOMAIN=      # CDN for serving published explainers

# App
NEXT_PUBLIC_APP_URL=
```

## Coding Conventions
- Use Server Components by default; add "use client" only when needed (interactivity, hooks)
- Keep LLM prompts in `src/lib/llm/prompts.ts` — never inline them
- All API routes return typed responses using Zod schemas
- Error handling: try/catch with structured error responses, never swallow errors
- Template components must be self-contained (no imports beyond react, framer-motion, and lucide-react icons)
- Use `cn()` utility (clsx + tailwind-merge) for conditional classes

## Commands
```bash
npm run dev          # Start dev server (localhost:3000)
npm run build        # Production build
npm run lint         # ESLint
npm run db:push      # Push Prisma schema to DB
npm run db:generate  # Generate Prisma client
npm run db:studio    # Open Prisma Studio
```

## Known Constraints
- Bedrock Claude has ~200K context window — large docs may need chunking
- Generated React components must stay under ~500 lines for Sandpack performance
- Free tier: 5 explainers/month per user (rate limit at API layer)
- Framer Motion animations should use `layout` prop for smooth transitions, avoid heavy spring physics on mobile
