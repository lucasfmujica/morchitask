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
    // Generated / vendored — not our source:
    "public/sw.js",
    "public/sw.js.map",
    "public/swe-worker*.js",
    ".shipstudio/**",
    // Supabase Edge Functions run on Deno, not in the Next app:
    "supabase/functions/**",
  ]),
]);

export default eslintConfig;
