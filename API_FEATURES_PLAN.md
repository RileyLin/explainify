# API Features Plan — Explainify

## Overview
Building 4 features: Public REST API, MCP Server, Mermaid Import, PNG Export.

---

## Feature 1: Public REST API with API Keys

### Files to Create/Modify
| File | Action |
|------|--------|
| `src/lib/api-auth.ts` | CREATE — hashApiKey + validateApiKey helpers |
| `src/app/api/v1/explain/route.ts` | CREATE — POST /api/v1/explain |
| `src/app/api/v1/keys/route.ts` | CREATE — GET/POST /api/v1/keys |
| `src/app/api/v1/keys/[id]/route.ts` | CREATE — DELETE /api/v1/keys/[id] |
| `src/app/settings/api-keys/page.tsx` | CREATE — Settings UI page |
| Supabase `api_keys` table | MIGRATE via REST API |

### Success Criteria
- [ ] `api_keys` table exists in Supabase with correct schema
- [ ] `POST /api/v1/explain` returns `{ url, slug, data, png_url }` with valid API key
- [ ] Returns 401 for invalid/missing key
- [ ] Returns 429 for free tier users > 5/mo
- [ ] `GET /api/v1/keys` returns user's masked keys
- [ ] `POST /api/v1/keys` creates key and returns raw key ONCE
- [ ] `DELETE /api/v1/keys/[id]` revokes key (ownership check)
- [ ] Settings page at /settings/api-keys shows keys and create UI
- [ ] TypeScript compiles clean

---

## Feature 2: MCP Server (npm package)

### Files to Create
| File | Action |
|------|--------|
| `/workspace/projects/explainify-mcp/package.json` | CREATE |
| `/workspace/projects/explainify-mcp/tsconfig.json` | CREATE |
| `/workspace/projects/explainify-mcp/src/index.ts` | CREATE |
| `/workspace/projects/explainify-mcp/README.md` | CREATE |
| `/workspace/projects/explainify-mcp/dist/index.js` | BUILT |

### Success Criteria
- [ ] `npm run build` compiles clean
- [ ] `dist/index.js` exists and is valid
- [ ] MCP server has `create_explainer` tool
- [ ] README has Claude Code + Cursor + generic stdio setup instructions

---

## Feature 3: Mermaid Import

### Files to Create/Modify
| File | Action |
|------|--------|
| `src/app/create/page.tsx` | MODIFY — add Mermaid tab/toggle + GitMerge button |
| `src/lib/llm/analyzer.ts` | MODIFY — detect [MERMAID_IMPORT] prefix and adjust system prompt |

### Success Criteria
- [ ] "Import from Mermaid" button with GitMerge icon visible on create page
- [ ] Clicking shows a textarea with Mermaid syntax example
- [ ] Generating with Mermaid content prefixes `[MERMAID_IMPORT]\n`
- [ ] analyzer.ts detects prefix and adds Mermaid-specific system prompt instructions
- [ ] TypeScript compiles clean

---

## Feature 4: PNG Export (Playwright screenshot)

### Files to Create/Modify
| File | Action |
|------|--------|
| `src/app/api/export/[slug]/png/route.ts` | CREATE — Playwright screenshot route |
| `src/app/e/[slug]/footer.tsx` | MODIFY — add "Download PNG" button |
| `src/app/api/v1/explain/route.ts` | MODIFY — include png_url in response |

### Success Criteria
- [ ] `GET /api/export/[slug]/png` returns PNG image (Content-Type: image/png)
- [ ] `?frame=true` adds dark padding/frame
- [ ] "Download PNG" button visible in viewer footer
- [ ] `/api/v1/explain` response includes `png_url`
- [ ] TypeScript compiles clean

---

## Test Results

### Feature 1
- Status: PENDING

### Feature 2
- Status: PENDING

### Feature 3
- Status: PENDING

### Feature 4
- Status: PENDING

---

## Summary
(Written after completion)
