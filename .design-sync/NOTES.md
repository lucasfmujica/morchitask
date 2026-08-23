# design-sync notes — Morchitask UI Kit

Project: https://claude.ai/design/p/8490950c-1c7d-43fa-996c-f8c7470f1250
First sync: 2026-08-23.

## What this repo is

Morchitask is a Next.js **application**, not a design-system package. There is no
`dist/`, no Storybook, no `exports` field, and `package.json` is `private: true`.
Only `components/ui/` is synced — 9 source files yielding 11 exported components.
The feature components (`day/`, `week/`, `tasks/`, `focus/`, …) are wired to
Supabase, next-auth and zustand and deliberately stay out: they cannot render
standalone in a design.

## Required setup before any build

1. **Self-symlink.** The converter resolves the package at
   `node_modules/<pkg>`, which npm never self-installs. Recreate after any
   `npm ci` / fresh clone:

   ```
   ln -sfn .. node_modules/morchitask
   ```

   Without it the build dies with `ENOENT … node_modules/morchitask/package.json`.

2. **Recompile the stylesheet.** `cfg.cssEntry` points into the gitignored
   `.design-sync/.cache/`, so it does not survive a clone. Regenerate before
   `package-build.mjs`:

   ```
   ./.ds-sync/node_modules/.bin/tailwindcss -i .design-sync/tailwind-entry.css \
     -o .design-sync/.cache/ds-styles.css --minify
   ```

   (`@tailwindcss/cli` is installed inside `.ds-sync/`, deliberately isolated
   from the repo lockfile — the repo itself has no Tailwind CLI binary.)

3. Build runs in **synth-entry mode** (`[NO_DIST]` is expected, not an error):
   with no built entry the converter synthesizes one from `cfg.srcDir`
   (`components/ui`). `cfg.tsconfig` is what makes the `@/lib/utils` alias
   resolve. `srcDir` is required — the default heuristic would pick `lib/`.

## Decisions worth remembering

- **`guidelinesGlob` is deliberately `[]`.** The default globs swept in
  `docs/GOOGLE_SETUP.md`, an OAuth setup guide containing the Supabase project
  URL. It has no place in a shareable design project. Do not re-enable the
  default without checking what `docs/` holds.
- **DM Sans is shipped, not fetched.** The app loads it via `next/font/google`,
  which defines `--font-dm-sans` at runtime. The bundle has no next/font, so
  `.design-sync/fonts/` carries the two `.woff2` files (extracted once from the
  `.next` build cache) plus a hand-written `@font-face`, and
  `tailwind-entry.css` binds `--font-dm-sans`. Without that binding `font-sans`
  resolves to nothing and every card renders in the browser default face.
- **The Tailwind scan is wide on purpose.** `tailwind-entry.css` sources all of
  `components/` and `app/`, plus an inline safelist of layout/spacing/sizing
  utilities. Two reasons: Tailwind only emits classes it has _seen_, so a
  narrow scan left the design agent's own layout glue unstyled; and Tailwind
  skips dot-directories, so `.design-sync/previews/` is never scanned — preview
  cards must use classes that exist elsewhere or are safelisted. Arbitrary
  values (`w-[320px]`) in previews silently do nothing; use `w-80`.

## Known render warns

None. The final run was 11/11 clean — no `bad`, `thin`, `variantsIdentical`, or
floor cards. Any warn on a future sync is genuinely new.

## Partially verified

- **TimePicker** — the dropdown holds its open state internally and only opens
  on click, so no static card can show the open list. Previews cover the closed
  trigger (empty, with value, custom placeholder, in a task row) only.
- **Confetti** — a one-shot full-viewport burst that fades out after ~2.6s.
  `cfg.overrides.Confetti.cardMode = "single"` stops the `fixed inset-0` pieces
  spilling across neighbouring cells. Captures land mid-flight by luck of
  timing.

## Re-sync risks

- **Confetti is nondeterministic** (`Math.random()` for 42 piece positions). If
  a future capture clears its grade on an otherwise no-change run, that is why —
  not a real regression.
- **The font files are a snapshot.** They were copied out of `.next/dev/static/
media/` at first sync. That cache is disposable and its hashed filenames
  change on rebuild, so the copies in `.design-sync/fonts/` are now the source
  of truth and are committed. If DM Sans is ever swapped in `app/layout.tsx`,
  these must be re-extracted by hand — nothing detects the drift.
- **`components/ui/index.ts` is not the component list.** Discovery scans every
  `.tsx` in `components/ui`, so `TimePicker` and `Confetti` sync even though the
  barrel does not export them. Adding a file to that directory adds a component
  to the design system silently.
- **The generated README's token section is misleading** — it enumerates
  Tailwind internals (`--tw-*`) as if they were design tokens. The real
  vocabulary is documented in `conventions.md`, which is prepended ahead of it.
  Re-validate every class name in that file against `_ds_bundle.css` on each
  sync; it is hand-written and will rot silently.
- Build assumed Node 26, Tailwind CLI 4.3.3, esbuild 0.28.2 (installed in
  `.ds-sync/`, gitignored and regenerated per machine).
