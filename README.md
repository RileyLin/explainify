# ✨ Explainify

**Paste complex content. Get beautiful interactive explainers.**

Explainify uses AI to transform dense technical documentation, architecture specs, and complex concepts into polished, interactive micro-webpages that make understanding effortless.

## The Problem

Technical knowledge is trapped in walls of text. Docs, architecture specs, API references — all static, all hard to follow. The people writing them don't have time to make them interactive. The people reading them skim and give up.

## The Solution

1. **Paste** any complex technical content
2. **AI analyzes** the content structure, concepts, and relationships
3. **Pick a template** — or let AI choose the best interaction pattern
4. **Get an interactive explainer** — animated, clickable, explorable
5. **Share anywhere** — hosted URL, embed code, or standalone HTML

## Interactive Templates

| Template | Best For | Interaction |
|----------|----------|-------------|
| 🔄 **Flow Animator** | Request flows, pipelines, processes | Step-through with animated arrows |
| 🧩 **Component Explorer** | System architecture, infrastructure | Clickable diagram with detail panels |
| 📝 **Code Walkthrough** | Code explanations, API examples | Line-by-line annotation with highlights |
| 🧱 **Concept Builder** | Abstract concepts, mental models | Progressive complexity layers |
| ⚖️ **Compare & Contrast** | Technology comparisons, tradeoffs | Side-by-side with toggle/slider |
| 🌲 **Decision Tree** | Selection guides, troubleshooting | Interactive branching paths |
| 📅 **Timeline** | Sequential processes, evolution | Expandable timeline nodes |

## Tech Stack

- **Next.js** (App Router) + **TypeScript**
- **Tailwind CSS** + **shadcn/ui** + **Framer Motion**
- **Claude** (via Amazon Bedrock) for AI analysis & generation
- **Supabase** (PostgreSQL) for data
- **Sandpack** for sandboxed component rendering

## Quick Start

```bash
git clone https://github.com/RileyLin/explainify.git
cd explainify
npm install
cp .env.example .env.local   # Fill in your keys
npm run dev                   # http://localhost:3000
```

## How It Works (Architecture)

```
┌─────────────────┐
│  User pastes     │
│  complex content │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────────────┐
│  Pass 1: Analyze │────▶│  Structured JSON      │
│  (Claude LLM)   │     │  concepts, flows,     │
│                  │     │  hierarchy, code      │
└─────────────────┘     └──────────┬───────────┘
                                   │
                        ┌──────────▼───────────┐
                        │  Template Selection   │
                        │  (AI-recommended or   │
                        │   user-chosen)        │
                        └──────────┬───────────┘
                                   │
                        ┌──────────▼───────────┐
                        │  Pass 2: Generate     │
                        │  React component      │
                        │  (Claude LLM)         │
                        └──────────┬───────────┘
                                   │
                        ┌──────────▼───────────┐
                        │  Sandboxed Preview    │
                        │  Live interactive     │
                        │  explainer            │
                        └──────────┬───────────┘
                                   │
                        ┌──────────▼───────────┐
                        │  Publish & Share      │
                        │  explainify.dev/e/... │
                        └──────────────────────┘
```

## Project Status

🚧 **Early development** — building core pipeline and first templates.

See [TASKS.md](./TASKS.md) for current progress and [REQUIREMENTS.md](./REQUIREMENTS.md) for full product spec.

## License

MIT
