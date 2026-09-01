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
  ]),
  {
    /**
     * No new Spanish (or English) hardcoded into the interface.
     *
     * This phase moved ~600 strings into `messages/*.json`, and the way that
     * work goes wrong is by omission: one `aria-label` typed straight into the
     * JSX and the English build has a Spanish word in it, with nothing failing.
     * These two rules make that a build error instead.
     *
     * They cover what a person reads — JSX text and the handful of attributes
     * that end up on screen or in a screen reader. They do NOT cover a string
     * literal in an expression (`{done ? "Listo" : …}`), which no ESLint
     * selector can distinguish from an id; `npm run i18n:scan` finds those.
     */
    files: ["app/**/*.tsx", "components/**/*.tsx"],
    ignores: ["**/*.test.tsx"],
    rules: {
      "react/jsx-no-literals": [
        "error",
        {
          // Symbols, key caps and product names: not language, and a catalog
          // entry for "·" would be worse than the literal.
          allowedStrings: [
            "↑",
            "↓",
            "⏎",
            "esc",
            "●",
            "+",
            "·",
            "%",
            "/",
            "#",
            "…",
            "🔥",
            ":00",
            "–",
            "⌘K",
            "Morchitask",
            "Google",
            "Google Calendar",
            "Spotify",
          ],
          // Attributes are covered by the rule below, which can tell the ones
          // a person reads from the ones React does.
          ignoreProps: true,
        },
      ],
    },
  },
  {
    // Two unrelated house rules share one entry because flat config REPLACES a
    // rule's options rather than merging them: split across two blocks with
    // overlapping `files`, the later one silently wins and the earlier stops
    // running at all.
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          // Text a person reads must come from the catalog. See the block
          // above for what this does and does not cover.
          selector:
            'JSXAttribute[name.name=/^(placeholder|aria-label|title|alt|kbdHint|hint|label|desc|emptyTitle|emptyHint)$/] > Literal[value=/[A-Za-zÀ-ÿ]{2}/][value!="Morchitask"]',
          message:
            'Ese texto lo lee una persona (o un lector de pantalla): sacalo a messages/es.json y usá t("clave"). Si de verdad no es idioma —una marca, un símbolo— agregalo a la lista de excepciones en eslint.config.mjs.',
        },
        {
          // Keep the design system honest: styling goes through the semantic
          // tokens in app/globals.css (bg-surface, text-muted, border-border,
          // bg-warning…), never Tailwind's raw palette. Raw colors don't
          // respond to the theme — that's how the modal scrims ended up stuck
          // in light-mode ink.
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
