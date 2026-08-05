import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated, self-contained plugin runtime: verbatim source copies plus a
    // vendored third-party bundle (esbuild output). Linting the minified bundle
    // is meaningless and its style is not ours; the canonical source under
    // tools/ is linted in place. The build-plugin drift check guards this tree.
    "tools/session/plugin/lib/**",
  ]),
]);

export default eslintConfig;
