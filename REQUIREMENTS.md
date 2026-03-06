# REQUIREMENTS.md — Explainify Product Requirements

## Vision
Transform any complex technical content into beautiful, interactive web explainers in seconds. Users paste dense documentation, architecture specs, or technical concepts — AI analyzes the content, selects the best interaction pattern, and generates a polished, shareable, interactive micro-webpage.

## Problem Statement
Technical knowledge is trapped in walls of text. Docs, architecture specs, API references, textbook chapters — all static, all boring, all hard to understand. The people who write them (engineers, educators, DevRel) know the content is valuable but lack time/skill to make it interactive. The people reading them skim, get confused, and give up.

Current solutions:
- **Static diagrams** (Napkin, Eraser) — better than text but still passive
- **Slide decks** (Gamma, PowerPoint) — linear, not explorable
- **Hand-crafted interactives** (Brilliant.org) — incredible but take weeks to build
- **LLM artifacts** (Claude, ChatGPT) — one-offs, no persistence, inconsistent quality

Nobody has nailed: paste content → instant high-quality interactive explainer → share anywhere.

## Target Users

### Primary: Technical Content Creators
- **Developer Relations / Developer Advocates** — need to make SDKs, APIs, architecture patterns accessible. Create content for blog posts, workshops, conference talks.
- **Solutions Architects** — explain cloud architectures, integration patterns, system designs to customers. Need quick visual aids for meetings and proposals.
- **Technical Writers** — produce documentation that people actually want to read and can understand.
- **Engineering Managers / Tech Leads** — explain system designs, RFC proposals, architecture decisions to their teams.

### Secondary: Educators & Trainers
- **University professors** — make CS, engineering, science concepts interactive for lectures
- **Corporate trainers** — turn compliance docs, onboarding materials, process guides into engaging content
- **Course creators** — add interactive components to online courses (Udemy, Teachable, Coursera)

### Tertiary: Knowledge Workers
- **Consultants** — explain complex frameworks and analyses to clients
- **Product managers** — make technical specs understandable for stakeholders
- **Students** — study complex topics by generating interactive study materials

## Core User Flow

### Happy Path
1. User lands on explainify.dev → sees examples of interactive explainers
2. Clicks "Create" → pastes technical content into editor (supports markdown, plain text, code)
3. Clicks "Generate" → sees loading state (~5-10 seconds)
4. AI analyzes content → selects best template → generates interactive component
5. User sees live preview of the interactive explainer
6. User can:
   - **Edit content** — modify text, labels, descriptions inline
   - **Switch template** — try a different interaction pattern (re-generates component, keeps analysis)
   - **Customize** — change colors, fonts, animation speed
   - **Publish** — get a shareable URL (explainify.dev/e/abc123)
   - **Embed** — get iframe/embed code for docs, blogs, Notion
   - **Export** — download as standalone HTML file
7. Published explainers are viewable by anyone with the link

### Content Types Supported (V1)
- Architecture diagrams & system design docs
- API documentation & integration guides
- Code explanations & tutorials
- Process flows & workflows
- Technical concepts & mental models
- Comparison docs (technology A vs B)

## Interactive Templates (V1)

### 1. Flow Animator
- **Best for:** Request flows, data pipelines, event-driven architectures, sequential processes
- **Interaction:** Step-through with play/pause/next/prev controls. Animated arrows show data flow between nodes. Click any node for detail popup.
- **Example use:** "How a request flows through API Gateway → Lambda → DynamoDB"

### 2. Component Explorer
- **Best for:** System architecture, microservices, infrastructure diagrams
- **Interaction:** Zoomable/pannable canvas. Click any component to expand detail panel (description, config, connections). Hover to highlight connected components.
- **Example use:** "AWS VPC architecture with subnets, security groups, and NAT gateways"

### 3. Code Walkthrough
- **Best for:** Code explanations, API examples, config files
- **Interaction:** Syntax-highlighted code panel with numbered annotations. Click annotation → highlights relevant lines + shows explanation. Can step through annotations sequentially.
- **Example use:** "Understanding a Terraform module for ECS Fargate"

### 4. Concept Builder
- **Best for:** Abstract concepts, layered mental models, progressive disclosure
- **Interaction:** Starts with simplest version of the concept. Click "Add layer" to progressively add complexity. Each layer animates in with explanation.
- **Example use:** "How neural networks work — from single perceptron to deep learning"

### 5. Compare & Contrast
- **Best for:** Technology comparisons, tradeoff analysis, before/after
- **Interaction:** Side-by-side panels with synchronized scrolling. Toggle/slider to switch between options. Highlight differences.
- **Example use:** "REST vs GraphQL — when to use which"

### 6. Decision Tree
- **Best for:** Choosing between options, troubleshooting guides, selection criteria
- **Interaction:** Interactive branching. Answer questions → follow path → arrive at recommendation. Can backtrack.
- **Example use:** "Which AWS database should I use?"

### 7. Timeline
- **Best for:** Sequential processes, historical evolution, version changes
- **Interaction:** Horizontal or vertical timeline with expandable nodes. Click to see details. Progress indicator shows where you are.
- **Example use:** "Evolution of containerization: VMs → Docker → Kubernetes → Serverless"

## Non-Functional Requirements

### Performance
- Generation time: < 15 seconds for typical content (< 5,000 words)
- Published explainer load time: < 2 seconds (LCP)
- Interactive animations: 60fps on modern browsers
- Mobile responsive: all templates must work on phone screens

### Scalability
- Support 10,000 concurrent users at launch
- Published explainers served via CDN (zero origin load)
- LLM calls are the bottleneck — queue with rate limiting

### Security
- Generated code runs in sandboxed iframes (no access to parent page)
- User content is never used for model training
- Published explainers can be set to public or private (link-only)
- Auth via OAuth (GitHub, Google) — no password storage

### Cost
- LLM cost per generation: ~$0.02-0.05 (Claude Sonnet via Bedrock)
- Storage per explainer: ~50-200KB (React component + metadata)
- Target: < $0.10 total cost per explainer generated

## Pricing Model

### Free Tier
- 5 explainers per month
- Watermark ("Made with Explainify")
- Public only (no private links)
- All templates available

### Pro ($15/month)
- Unlimited explainers
- No watermark
- Private links + password protection
- Custom branding (logo, colors)
- Embed anywhere
- Priority generation (faster queue)
- Analytics (views, engagement, drop-off)

### Enterprise ($49/seat/month)
- Everything in Pro
- Team workspaces
- SSO (SAML/OIDC)
- Custom templates
- API access
- SLA + priority support
- Self-hosted option

## Success Metrics
- **North Star:** Monthly Active Explainers Published
- **Activation:** User creates first explainer within 5 minutes of signup
- **Retention:** 40%+ of users create 2+ explainers in first month
- **Virality:** 20%+ of viewers click "Made with Explainify" → sign up
- **Revenue:** $10K MRR within 6 months of launch

## Out of Scope (V1)
- Real-time collaboration / multiplayer editing
- Video export (animated MP4/GIF)
- Voice narration overlay
- LMS integrations (SCORM, xAPI)
- Custom template builder (users create their own templates)
- Mobile app
- Offline mode
