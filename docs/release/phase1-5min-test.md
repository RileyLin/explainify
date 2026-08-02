# Explainify Phase 1 — 5-Minute Test Script

Audience: @riley-lin. Goal: confirm the release candidate works end-to-end in a
real browser in ~5 minutes. Use the preview URL once it is published, or run
locally (instructions at the bottom).

Base URL: `<PREVIEW_URL>` (feature-branch Vercel Preview — **not** production).

## 1. Home (30s)
1. Open `<PREVIEW_URL>/`.
2. Expect: "Complex ideas, explained interactively." hero, an animated live-demo
   diagram, "Create an Explainer" CTA, and the "Explainify" wordmark in the
   header. No "VizBrief" anywhere.

## 2. Generate a real explainer (2 min) — the core product proof
1. Click **Create an Explainer** (or open `/create`).
2. Paste any technical text, e.g.:
   > Explain how the TCP three-way handshake establishes a connection between a
   > client and a server.
3. Leave format on **Auto-detect**, click **Generate Explainer**.
4. Expect: after ~10–20s, an interactive step-through diagram (for this input,
   a Flow Diagram with SYN / SYN-ACK / ACK steps). Step through the nodes.
   - This is a live Amazon Bedrock generation (model
     `us.anthropic.claude-sonnet-4-6`), not a canned sample.

## 3. Pricing + Sign in (1 min)
1. Open `/pricing`. Expect Free vs Pro tiers, no layout overflow on mobile.
2. Open `/auth/signin`. Expect provider buttons matching the configured OAuth
   apps. On preview without OAuth secrets, providers may be absent — that is
   expected controlled degradation, not a crash.

## 4. SEO / legal (1 min)
1. Open `/explain/blockchain` and `/explain/quantum-physics` — pre-rendered
   explainer pages should load with content.
2. Open `/privacy` and `/terms`. **Resolved:** the public support/privacy
   contact is now `admin@driftworks.dev` (owner decision, msg 40fcc97e), a
   deliverable mailbox — `driftworks.dev` has an MX record (`smtp.google.com`) —
   applied across pricing/privacy/terms with the undeliverable
   `support@explainify.dev` fully removed. Confirm the pages show the new
   address and the `mailto:` links point to it.

## 5. Decision
- If the generate flow and pages look right on desktop and mobile, the local
  release candidate is good. The previously-flagged support/privacy contact is
  now resolved (`admin@driftworks.dev`, deliverable MX).
- Production deploy waits for your explicit approval after this test.

---

## Running locally (no preview URL)

Requires this repo checkout with dependencies installed and AWS Bedrock access
(instance profile or credentials) in region `us-west-2`.

```bash
# Test-harness env only (never commit / ship this):
cat > .env.local <<'ENV'
LLM_PROVIDER=bedrock
AWS_REGION=us-west-2
BEDROCK_MODEL_ID=us.anthropic.claude-sonnet-4-6
AUTH_TRUST_HOST=true
AUTH_SECRET=dev-only-synthetic-secret
ENV

npm ci
npm run build
PORT=3100 npm run start   # open http://127.0.0.1:3100
```

Deterministic browser regression (desktop + mobile, all key pages):

```bash
LD_LIBRARY_PATH=~/.local/share/chromium-runtime/root/usr/lib/x86_64-linux-gnu \
  DOGFOOD_BASE=http://127.0.0.1:3100 \
  node scripts/dogfood-playwright.mjs
# exit 0 = all pass; screenshots under /tmp/dogfood-shots
```

Note: a headless host with no emoji font renders emoji as □ boxes in
screenshots (e.g. the `/create` template labels). The app serves the correct
emoji in HTML; this is a screenshot-host artifact, not a shipped defect.
