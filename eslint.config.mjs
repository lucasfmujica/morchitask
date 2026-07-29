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
  {
    // Keep the design system honest: styling goes through the semantic tokens
    // in app/globals.css (bg-surface, text-muted, border-border, bg-warning…),
    // never Tailwind's raw palette. Raw colors don't respond to the theme —
    // that's how the modal scrims ended up stuck in light-mode ink.
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "Literal[value=/\\b(bg|text|border|ring|from|via|to|divide|outline|decoration|shadow|accent|caret|fill|stroke)-(gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\\d{2,3}\\b/]",
          message:
            "Usá un token semántico (bg-surface, text-muted, border-border, bg-warning, bg-scrim…) en vez de la paleta cruda de Tailwind. Los colores crudos no responden al tema. Si falta un token, agregalo en app/globals.css.",
        },
      ],
    },
  },
]);

export default eslintConfig;
