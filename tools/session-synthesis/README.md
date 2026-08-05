# Session Synthesis

Consumes a validated `SessionEvidenceBundle` and writes a local-only:

- `index.html` explanation;
- portable `workstream-package.json`;
- integrity `receipt.json`.

```bash
npm run explain:session -- feature /tmp/session-feature
npm run explain:session -- debugging /tmp/session-debugging
npm run explain:session -- path/to/bundle.json output/session
```

This boundary does not read Claude transcripts, run MCP, call a model, publish,
or compare sessions. Capture is owned by the Phase 1A adapter.
