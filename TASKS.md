# Explainify Task Tracker

Last verified: 2026-08-02

## Quality Baseline

- [x] `npm test`: 96/96 tests passing across 7 test files
- [x] `npm run lint`: 0 errors / 16 warnings
- [x] `npx tsc --noEmit`: passing
- [x] Clean-environment `npm run build`: passing, 24/24 static pages generated
- [x] `npm audit --omit=dev`: 0 production vulnerabilities
- [x] Tests and production builds run without credentials
- [x] Runtime integrations fail with controlled configuration errors when required
  environment variables are absent

The 16 lint warnings are known non-blocking cleanup items. Development-only
dependency advisories remain outside the production audit gate.

## Phase 1: Stabilize

- [x] WP-A: restore renderer tests and add the `npm test` script
- [x] WP-B: eliminate lint errors with concrete types and hook fixes
- [x] WP-D: make external clients lazy and reconcile environment documentation
- [x] WP-C: remove critical/high production dependency vulnerabilities
- [x] WP-E: reconcile this tracker and remove stale predecessor branding

## Implemented Product Surface

- [x] Seven validated explainer schemas and interactive renderers
- [x] OpenAI and Amazon Bedrock provider support
- [x] Generate, publish, public viewer, embed, and PNG export routes
- [x] GitHub and Google OAuth configuration with JWT sessions
- [x] Dashboard, usage tracking, and API key management
- [x] Stripe checkout and subscription webhook handling
- [x] Deep-dive generation, breadcrumbs, sharing, and remix controls
- [x] Dynamic Open Graph images and topic landing pages

## Runtime Validation Still Required

These items require deployment-owned credentials or infrastructure and are not
implied by the credential-free quality baseline:

- [ ] Validate OpenAI and Bedrock generation with live provider accounts
- [ ] Validate Supabase migrations, row-level security, publish, and storage in
  the target deployment
- [ ] Configure and validate GitHub and Google OAuth applications
- [ ] Configure Stripe products, prices, webhook delivery, and customer portal
- [ ] Run browser-level visual checks across desktop and mobile viewports
- [ ] Confirm the production `NEXT_PUBLIC_APP_URL`

## Phase 2: Agent Comprehension Spike

Phase 2 is planned, not implemented. The frozen contract and benchmark live on
branch `product/phase2-contract` at commit
`2dbf21dc6f563d0930802f4170783ddeadb05518`.

Next scope:

- [ ] Add one local-first `explainify.create_checkpoint` agent-callable path
- [ ] Pin and isolate the Archify adapter
- [ ] Produce local HTML, manifest, and receipt artifacts
- [ ] Pass the six spike cases and all 11 contract acceptance checks
- [ ] Keep publishing explicit and separate; do not change the production
  generation path during the spike
- [ ] Independently evaluate the frozen 20-case comprehension benchmark

## Backlog

- Customer subscription portal
- Discover/gallery experience and featured explainers
- Analytics for views, engagement, and completion
- Standalone HTML and video export
- Team workspaces, SSO, and custom templates
- Documentation platform integrations and self-hosting
