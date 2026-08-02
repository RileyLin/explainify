# Archify vs Explainify: Product Strategy

**Research date:** 2026-08-02
**Primary Archify analyzed:** [`tt-a1i/archify`](https://github.com/tt-a1i/archify) v2.12.0

## Executive Decision

**Do not abandon Explainify, and do not pivot into an Archify clone.**

Continue the current Stabilize phase, then reposition Explainify as the **content-to-understanding and publishing layer**:

- Use Archify, via a pinned adapter, for verified architecture/workflow/sequence/data-flow/lifecycle artifacts.
- Keep Explainify focused on what Archify intentionally does not provide: broad content ingestion, code walkthroughs, concept building, comparison, decision trees, recursive deep dives, hosted URLs, embeds, libraries, accounts, analytics, and commercial workflows.
- Open-source a differentiated core/protocol and adapter SDK, not another generic architecture-diagram engine.

This is an **integration and narrowing** decision, not a full product pivot.

## Which Archify?

There are at least three new repositories with this name:

1. [`tt-a1i/archify`](https://github.com/tt-a1i/archify): the likely subject. It is an MIT agent skill for generating validated interactive technical diagrams. GitHub reported 8,387 stars and 653 forks when retrieved.
2. [`Salah-XD/archify`](https://github.com/Salah-XD/archify): an Apache-2.0 local-first Chrome extension for runtime architecture and client-side security inspection.
3. [`Aryan1718/Archify`](https://github.com/Aryan1718/Archify): a repository analysis CLI that generates grounded architecture documentation for AI assistants.

The strategic recommendation below assumes the first repository. The other two are adjacent and mostly complementary to Explainify.

## Confirmed Archify Position

Archify v2.12.0 is a local agent skill and zero-runtime-dependency artifact generator:

- Five typed modes: architecture, workflow, sequence, data flow, and lifecycle.
- Typed JSON IR, deterministic validation, structured repair receipts, and evidence pinned to repository revisions.
- Self-contained interactive HTML plus PNG, JPEG, WebP, SVG, WebM, and share-card export.
- Reader tools for search, focus, exact routes, upstream/downstream reach, guided stories, presentation, and deep links.
- MIT licensed, with explicit attribution to its upstream project.
- Hosted sharing, WYSIWYG editing, and general-purpose drawing are explicitly outside scope.

I independently cloned commit `7b49d0b`, installed its five development packages, and ran its test suite: **527/527 tests passed**. `npm audit` reported one fixable high-severity issue in the development dependency chain (`fast-uri`); the packaged artifact itself is designed to run without installed dependencies.

Primary evidence:

- [Archify README](https://github.com/tt-a1i/archify/blob/main/README.md)
- [Product definition](https://github.com/tt-a1i/archify/blob/main/PRODUCT.md)
- [Skill contract](https://github.com/tt-a1i/archify/blob/main/archify/SKILL.md)
- [License](https://github.com/tt-a1i/archify/blob/main/LICENSE)
- [v2.12.0 release](https://github.com/tt-a1i/archify/releases/tag/v2.12.0)
- [Live product page](https://tt-a1i.github.io/archify/)

## Where It Conflicts

| Surface | Archify | Explainify | Conflict |
|---|---|---|---|
| Architecture maps | Strong, validated, repository-grounded | Flow Animator + Component Explorer | High |
| Workflows/sequences | Dedicated typed renderers | Flow Animator + Timeline | High |
| Data flow/lifecycle | Dedicated typed renderers | Generic flow/timeline | Medium-high |
| Repository truth | Revision-verified source evidence | Primarily LLM-generated from pasted content | Archify advantage |
| Output reliability | Deterministic gates and atomic delivery | Zod validation and renderer tests | Archify advantage |
| Technical export | HTML, vector, raster, video, share cards | Hosted page and PNG path | Archify advantage today |

Building another generic architecture renderer would compete against a mature, fast-moving open-source project without adding enough user value.

## Where Explainify Is Different

| Surface | Explainify advantage |
|---|---|
| Input breadth | Long-form docs, technical concepts, educational content, podcasts/newsletters, code, and Mermaid |
| Learning formats | Code Walkthrough, Concept Builder, Compare & Contrast, Decision Tree, and progressive educational interactions |
| Recursive understanding | Node-level deep dives and linked explainer trees |
| Hosted product | Public/private URLs, embeds, dashboard, auth, API keys, waitlist/billing direction |
| Content libraries | Large searchable collections and generated explainer catalogs |
| Audience | DevRel, technical writers, educators, PMs, trainers, students, and non-engineering readers |
| Commercial layer | Usage limits, analytics, branding, teams, enterprise, and API/MCP distribution |

Archify deliberately avoids a hosted service and editor. That leaves real room for Explainify, but only if Explainify stops presenting itself primarily as an architecture-diagram generator.

Evidence:

- [Explainify README](https://github.com/RileyLin/explainify/blob/main/README.md)
- [Explainify requirements](https://github.com/RileyLin/explainify/blob/main/REQUIREMENTS.md)
- [Live Explainify deployment](https://explainify-lime.vercel.app/)

## Product Positioning

Recommended category:

> **Explainify turns dense content into guided, publishable understanding.**

Recommended product boundary:

- **Archify engine:** verified technical maps.
- **Explainify engines:** concepts, code, comparisons, decisions, timelines, and deep dives.
- **Explainify platform:** ingest, route, host, embed, organize, measure, and collaborate.

This makes Archify a possible engine or upstream dependency, not the company-level competitor.

## Integration Shape

Build a small, pinned adapter rather than copying Archify internals:

1. Analyze input and classify the user question.
2. Route technical topology to Archify JSON IR.
3. Invoke a pinned Archify release in an isolated worker.
4. Require a passing validation/delivery receipt.
5. Store the self-contained HTML and serve it in a sandboxed iframe with a strict CSP.
6. Preserve source provenance and validation metadata in Explainify's artifact manifest.
7. Add Explainify deep-dive actions around the artifact without modifying Archify's authored topology.
8. Route concept, code, comparison, and decision content to native Explainify renderers.

Important constraints:

- Archify's package is marked `private`; it is distributed as a Skill/CLI and release archive, not a stable npm library API. Pin a release/commit and isolate the adapter.
- Preserve MIT copyright and attribution notices if code is vendored or redistributed.
- Do not fork and rebrand the full renderer. Upstream general improvements; keep hosted and educational behavior in Explainify.
- Treat generated HTML as untrusted content even when validation passes.

## Open-Source Decision

**Yes, still build an open-source project, but change what is open-sourced.**

Recommended split:

- `explainify-core` or `interactive-explainer-protocol`: typed artifact manifest, content router, educational schemas/renderers, deep-dive graph, and renderer adapter contract.
- `@explainify/archify-adapter`: optional pinned adapter and provenance bridge.
- Explainify hosted product: publishing, accounts, storage, analytics, billing, teams, and managed generation.

Do not make the open-source headline "AI architecture diagrams." Archify already owns that position more credibly.

There is also an immediate legal hygiene issue: Explainify's README says "MIT," but the repository has no `LICENSE` file and GitHub reports no detected license. Until an actual license is committed, the public repository is **source-available, not clearly open-source**.

## Options

| Option | Assessment | Decision |
|---|---|---|
| Continue Explainify unchanged | Duplicates Archify's strongest surface and keeps unclear positioning | Reject |
| Stop Explainify and clone/pivot to Archify | Gives up broader learning and hosted-product differentiation | Reject |
| Fork Archify into Explainify | Fast technically, weak strategically, creates upstream maintenance burden | Reject |
| Integrate Archify and narrow Explainify | Uses the best technical engine while preserving differentiated value | **Recommend** |
| Become only "Archify Cloud" | Plausible only if hosted publishing proves to be the dominant demand | Conditional fallback |

## Validation Plan

Do not make a full pivot from repository comparison alone.

### Step 1: Finish Stabilize

Complete the existing test, lint, build/env, security, and brand gates. A competitor does not remove the need for a trustworthy baseline.

### Step 2: Three-Day Integration Spike

Create a throwaway adapter and a fixed corpus:

- 10 architecture/workflow/sequence inputs.
- 5 code/concept inputs.
- 5 comparison/decision/timeline inputs.

For technical inputs, compare current Explainify with Archify on:

- Factual accuracy and unsupported claims.
- Route/label legibility.
- Time to usable artifact.
- Artifact size and mobile containment.
- Export quality.
- Human preference from blind review.

### Step 3: One-Week User Test

Test with at least five target users across DevRel, solutions architecture, technical writing, and education. Observe:

- Whether they start from a repository, a document, or a question.
- Which format they choose.
- Whether hosted publishing/embed matters.
- Whether they use deep dives.
- Whether they return to edit or regenerate.

### Decision Gates

- **Integrate:** Archify clearly wins technical-map quality and technical content is a substantial share of demand.
- **Continue differentiated:** concept/code/decision/deep-dive usage and hosted sharing are the stronger retention signals.
- **Pivot to hosted Archify layer:** users overwhelmingly want repository-grounded maps, but repeatedly ask for hosting, teams, comments, analytics, or managed generation.
- **Stop:** neither the broader explainer formats nor the hosted layer produce repeat use.

## Immediate Roadmap Change

Keep Phase 1 Stabilize unchanged. Add one Phase 2 discovery epic:

> **Verified technical-map adapter and positioning test**

Deliverables:

1. Pinned Archify adapter proof of concept.
2. Shared artifact/provenance manifest.
3. Twenty-input comparison dataset and scored results.
4. Five-user interview report.
5. Final keep/integrate/pivot decision.

The most urgent current product problem is still internal drift: the live deployment presents **VizBrief** while the repository and roadmap say **Explainify**. Resolve that before interpreting weak adoption as a market verdict.
