# TASKS.md — Explainify Task Tracker

## Status Key
- ⬜ Not started
- 🔵 In progress
- ✅ Done
- 🔴 Blocked
- ⏸️ Paused

---

## Phase 0: Project Setup
- [x] Create GitHub repo (RileyLin/explainify)
- [x] Write CLAUDE.md (codebase context)
- [x] Write REQUIREMENTS.md (product spec)
- [x] Write TASKS.md (this file)
- [x] Write README.md
- [x] Initialize Next.js project with TypeScript
- [x] Configure Tailwind CSS + shadcn/ui
- [ ] Set up Prisma with Supabase (deferred to Phase 2)
- [x] Configure ESLint
- [x] Set up .env.example with all required vars
- [x] Create initial folder structure per CLAUDE.md

**Status:** ✅ Complete

---

## Phase 1: Core Pipeline (MVP — Weeks 1-2)

### 1A: Zod Schemas (JSON DSL)
- [x] Define ExplainerMeta shared type
- [x] Flow Animator schema (FlowNode, FlowConnection, FlowAnimatorData)
- [x] Code Walkthrough schema (CodeBlock, CodeAnnotation, CodeWalkthroughData)
- [x] Concept Builder schema (ConceptLayer, ConceptBuilderData)
- [x] Discriminated union ExplainerData
- [x] Tests: 14 passing (valid/invalid data, union discrimination)

### 1B: Template Renderers
- [x] Renderer registry with lazy-loaded components (next/dynamic)
- [x] Flow Animator — ReactFlow + Motion, step-through, detail panel, custom nodes
- [x] Code Walkthrough — Shiki syntax highlighting, annotations, tab bar, step-through
- [x] Concept Builder — progressive layer reveal, Motion animations, progress dots
- [x] Tests: 7 passing (mount + render verification for all 3 renderers)

### 1C: Create Page UI
- [x] Paste textarea with template selector
- [x] Mock generation with 2s delay
- [x] Template switcher on results
- [x] All 3 renderers wired and working

### 1D: Landing Page
- [x] Hero section with CTA
- [x] "How it works" 3-column section
- [x] Template showcase cards
- [x] Footer
- [x] Dark-mode-first design

### 1E: LLM Analysis Pipeline (deferred to Phase 2)
- [ ] Build content analyzer prompt
- [ ] Implement Bedrock Claude client (src/lib/llm/analyzer.ts)
- [ ] Wire real LLM generation to replace mock data

**Status:** ✅ Complete (MVP with mock data; LLM integration deferred)

---

## Phase 2: Polish & Publish (Weeks 3-4)

### 2A: LLM Integration
- [x] Build content analyzer prompt (system prompt per template)
- [x] Implement Bedrock Claude client
- [x] Multi-model LLM support (OpenAI GPT-4o + Bedrock via provider pattern)
- [x] Provider factory: auto-detection (openai → bedrock fallback)
- [x] Wire /api/generate endpoint (accepts optional `model` parameter)
- [x] Zod validation of LLM output with retry on failure
- [x] Tests: 18 new tests for client, prompts, analyzer (all passing)
- [ ] Test with diverse content samples (needs manual testing with live API)

### 2B: Publishing System
- [x] Database schema for explainers (Supabase) — migration applied
- [x] Publish flow: save generated JSON + metadata to DB
- [x] Public viewer page (/e/[slug]) — loads and renders published explainer
- [x] Embed code generator (iframe snippet)
- [ ] Download as standalone HTML (deferred)
- [x] "Made with Explainify" watermark on free tier

### 2C: Auth & User Management
- [x] NextAuth.js v5 setup (GitHub + Google OAuth providers)
- [x] Database migration: users table, usage table, user_id on explainers
- [x] Session provider + Header with sign-in/out UI
- [x] User dashboard — list of created explainers with delete
- [x] Wire auth to publish — user_id saved with explainer
- [x] Usage tracking (generations per month)
- [x] Free tier enforcement (5/month limit, 429 on exceed)
- [ ] OAuth client IDs needed from Riley (GitHub + Google)

### 2D: Editor Enhancements
- [x] Inline text editing component (EditableText — click to edit titles, labels, descriptions)
- [x] Color theme picker (8 preset accent colors)
- [x] Animation speed control (Slow / Normal / Fast via React context)
- [x] Editor controls bar on create page results view
- [ ] Mobile preview toggle (deferred — complex, not essential for launch)
- [ ] Undo/redo (deferred — complex, not essential for launch)

### 2E: Additional Templates
- [x] Compare & Contrast template (schema + renderer + prompt + tests)
- [x] Decision Tree template (schema + renderer + prompt + tests)
- [x] Timeline template (schema + renderer + prompt + tests)
- [x] Component Explorer template (schema + renderer + prompt + tests)
- [x] All 7 templates wired: schemas, renderers, prompts, registry, create page, viewer
- [x] Mock data for all 7 templates in create page
- [x] 89 tests passing (up from 39)

### 2F: Step Transition Animations
- [x] Flow Animator: pulse/glow animation on newly active node + edge glow transition
- [x] Concept Builder: background color pulse when new layer appears
- [x] Code Walkthrough: smooth Motion-based highlight overlay transitions (fade in/out)
- [x] All animations 200-400ms, subtle and snappy

**Status:** ✅ Phase 2 complete (OAuth client IDs needed from Riley)

---

## Phase 3: Growth & Monetization (Weeks 5-8)

### 3A: Viral Features
- [x] OG images (dynamic social cards via /api/og/[slug] with Next.js ImageResponse)
- [x] Twitter/LinkedIn/Copy link share buttons on published explainers
- [x] "Remix" button on published explainers (redirect to /create with remix slug)
- [x] "Made with Explainify" CTA with UTM params on published explainers
- [x] OpenGraph + Twitter Card metadata on /e/[slug] pages
- [ ] Explainer gallery / discover page (deferred)
- [ ] Weekly "Explainer of the Week" featured showcase (deferred)

### 3B: Stripe Integration
- [x] Stripe server client (src/lib/stripe.ts) with test keys
- [x] Pricing page (/pricing) — Free vs Pro ($15/mo) comparison
- [x] Checkout flow (/api/stripe/checkout) — Stripe hosted checkout
- [x] Webhook handler (/api/stripe/webhook) — checkout.session.completed, subscription.deleted/updated
- [x] Database migration (003_add_subscription.sql) — plan, stripe_customer_id, stripe_subscription_id
- [x] Pro users bypass generation limit in /api/generate
- [x] Pro users get no watermark flag on published explainers
- [x] .env.local configured with Stripe test keys + webhook secret
- [ ] Customer portal (manage subscription) — deferred
- [ ] Upgrade prompts when hitting free tier limits — deferred

### 3C: Analytics
- [ ] View count per explainer
- [ ] Engagement metrics (time spent, sections clicked, completion rate)
- [ ] Dashboard for Pro users

### 3D: API
- [ ] Public API for generating explainers programmatically
- [ ] API key management
- [ ] Rate limiting per tier
- [ ] Documentation (dogfood: use Explainify to explain the Explainify API)

**Status:** ✅ Phase 3A + 3B complete

---

## Phase 4: Scale & Enterprise (Months 3-6)

- [ ] Team workspaces
- [ ] SSO (SAML/OIDC)
- [ ] Custom branded themes
- [ ] Custom template builder
- [ ] Docs platform integrations (Mintlify, GitBook, ReadMe)
- [ ] Self-hosted option
- [ ] SOC2 compliance prep

**Status:** ⬜ Not started

---

## Backlog / Ideas
- Voice narration overlay (ElevenLabs TTS reads through the explainer)
- Video export (screen-record the interactive as MP4/GIF)
- Chrome extension (highlight text on any page → generate explainer)
- Notion integration (embed directly in Notion pages)
- Multi-language support (generate explainers in any language)
- AI tutor mode (ask follow-up questions about the explainer)
- Collaborative editing (Google Docs-style multiplayer)
- SCORM/xAPI export for LMS integration
- Figma plugin (import designs as explainer components)

---

## Current Sprint
**Goal:** Phase 3A + 3B — Viral features + Stripe integration
**Assignee:** Kit (AI) + Riley (review)
**Target:** Week of Mar 10, 2026
