import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@engine": path.resolve(__dirname, "tools/workstream-brief"),
    },
  },
  define: {
    "process.env.NODE_ENV": '"development"',
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    globals: true,
    // Vitest suites all live under tests/. The comparative engine (tools/comprehension/comparative)
    // ships its own node:test suite run via `npm run test:comparative`; scoping the include glob to
    // tests/ keeps vitest from mis-collecting those node:test files as (empty) vitest suites.
    include: ["tests/**/*.{test,spec}.{ts,tsx}"],
  },
});
