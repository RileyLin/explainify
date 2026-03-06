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
- [ ] Initialize Next.js project with TypeScript
- [ ] Configure Tailwind CSS + shadcn/ui
- [ ] Set up Prisma with Supabase
- [ ] Configure ESLint + Prettier
- [ ] Set up .env.example with all required vars
- [ ] Create initial folder structure per CLAUDE.md

**Status:** 🔵 In progress

---

## Phase 1: Core Pipeline (MVP — Weeks 1-2)

### 1A: LLM Analysis Pipeline
- [ ] Build content analyzer prompt (Pass 1)
- [ ] Define structured output schema (Zod) for analysis JSON
- [ ] Implement Bedrock Claude client (src/lib/llm/analyzer.ts)
- [ ] Test with 5+ diverse content samples (architecture doc, code tutorial, API doc, concept explainer, comparison)
- [ ] Handle edge cases: very short content, very long content (chunking), code-heavy, diagram-heavy

### 1B: Template System Foundation
- [ ] Define template interface/props contract
- [ ] Build template registry (src/lib/templates/registry.ts)
- [ ] Implement **Flow Animator** template (priority #1 — best demo impact)
- [ ] Implement **Component Explorer** template (priority #2 — architecture docs)
- [ ] Implement **Code Walkthrough** template (priority #3 — code tutorials)
- [ ] Each template: responsive, animated (Framer Motion), accessible

### 1C: Code Generation Pipeline
- [ ] Build component generator prompt (Pass 2)
- [ ] Implement generator that fills templates with analyzed content
- [ ] Sandpack integration for live preview rendering
- [ ] Error handling: malformed LLM output → retry with constraints
- [ ] Validate generated code compiles before showing to user

### 1D: Basic UI
- [ ] Landing page with examples
- [ ] Create page: paste area → generate button → loading state
- [ ] Preview panel: live rendered explainer via Sandpack
- [ ] Template switcher (regenerate with different template)
- [ ] Publish button → generate shareable URL

**Status:** ⬜ Not started

---

## Phase 2: Polish & Publish (Weeks 3-4)

### 2A: Publishing System
- [ ] Database schema for explainers (Prisma/Supabase)
- [ ] Publish flow: save generated code + metadata to DB
- [ ] Public viewer page (/e/[slug]) — loads and renders published explainer
- [ ] Embed code generator (iframe snippet)
- [ ] Download as standalone HTML
- [ ] "Made with Explainify" watermark on free tier

### 2B: Auth & User Management
- [ ] NextAuth.js setup (GitHub + Google OAuth)
- [ ] User dashboard — list of created explainers
- [ ] Edit/delete existing explainers
- [ ] Usage tracking (generations per month)
- [ ] Free tier enforcement (5/month limit)

### 2C: Editor Enhancements
- [ ] Inline text editing (modify labels, descriptions without regenerating)
- [ ] Color theme picker (light/dark/custom accent)
- [ ] Animation speed control
- [ ] Mobile preview toggle
- [ ] Undo/redo

### 2D: Additional Templates
- [ ] Concept Builder template
- [ ] Compare & Contrast template
- [ ] Decision Tree template
- [ ] Timeline template

**Status:** ⬜ Not started

---

## Phase 3: Growth & Monetization (Weeks 5-8)

### 3A: Viral Features
- [ ] "Remix" button on published explainers (fork & modify)
- [ ] Social sharing (OG images, Twitter cards)
- [ ] Explainer gallery / discover page
- [ ] Weekly "Explainer of the Week" featured showcase

### 3B: Stripe Integration
- [ ] Pro tier checkout ($15/month)
- [ ] Usage-based billing enforcement
- [ ] Upgrade prompts when hitting free tier limits
- [ ] Customer portal (manage subscription)

### 3C: Analytics
- [ ] View count per explainer
- [ ] Engagement metrics (time spent, sections clicked, completion rate)
- [ ] Dashboard for Pro users

### 3D: API
- [ ] Public API for generating explainers programmatically
- [ ] API key management
- [ ] Rate limiting per tier
- [ ] Documentation (dogfood: use Explainify to explain the Explainify API)

**Status:** ⬜ Not started

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
**Goal:** Complete Phase 0 (project setup) + start Phase 1A (LLM pipeline)
**Assignee:** Kit (AI) + Riley (review)
**Target:** Week of Mar 6, 2026
