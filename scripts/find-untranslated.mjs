#!/usr/bin/env node
/**
 * Finds user-visible text that never made it into a message catalog.
 *
 * Written after three "finished" i18n batches turned out to have left strings
 * behind: grepping for a quoted literal misses text that spans lines, text with
 * an interpolation in the middle, and whole files nobody thought to open. This
 * reads the JSX instead — text nodes and the attributes a person can actually
 * see — so a miss has to survive a rule rather than a memory.
 *
 * Not a linter: it errs toward reporting, and a few known-good hits (a brand
 * name, a key cap) stay on the list. Read the output, don't count it.
 *
 *   node scripts/find-untranslated.mjs [paths…]     (default: components app)
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** Attributes whose value a user reads or hears. */
const VISIBLE_ATTRS = ["placeholder", "aria-label", "title", "alt", "kbdHint", "hint", "label"];

/** Text that is not language: symbols, brand, key caps, bare numbers. */
const ALLOWED = /^(?:[\s\d.,:;+\-–—/%·×()[\]{}]*|Morchitask|Google|Spotify|esc|[A-Z]|⌘K|↑|↓|⏎)$/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx") && !p.endsWith(".test.tsx")) out.push(p);
  }
  return out;
}

/** Blanks out comments so JSDoc prose can't masquerade as UI text. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

const lineOf = (src, index) => src.slice(0, index).split("\n").length;

function findings(file) {
  const src = stripComments(readFileSync(file, "utf8"));
  const hits = [];

  for (const attr of VISIBLE_ATTRS) {
    const re = new RegExp(`\\b${attr}="([^"]+)"`, "g");
    for (const m of src.matchAll(re)) {
      if (ALLOWED.test(m[1])) continue;
      hits.push([lineOf(src, m.index), `${attr}=`, m[1]]);
    }
  }

  // JSX text nodes, including ones broken across lines or split by an
  // interpolation — the two shapes a literal grep cannot see. `>…<` also spans
  // generics and expressions, so anything carrying code punctuation is dropped.
  for (const m of src.matchAll(/>([^<>]*?)</g)) {
    const raw = m[1].replace(/\s+/g, " ").trim();
    const text = raw
      .replace(/\{[^{}]*\}/g, " ") // an interpolation is not the words
      .replace(/\s+/g, " ")
      .trim();
    if (!/\p{L}{2}/u.test(text)) continue;
    if (ALLOWED.test(text)) continue;
    if (/[=;(){}[\]]|=>|\?\?|\|\||&&|\.\w/.test(text)) continue;
    // A lone lowercase identifier is a code fragment, not a sentence.
    if (/^[\w$]+$/.test(text) && !/^[A-ZÁ-Ú]/u.test(text)) continue;
    hits.push([lineOf(src, m.index), "text", raw]);
  }
  return hits;
}

const roots = process.argv.slice(2);
const files = (roots.length ? roots : ["components", "app"]).flatMap((r) =>
  statSync(r).isDirectory() ? walk(r) : [r],
);

let total = 0;
for (const file of files.sort()) {
  const hits = findings(file);
  if (!hits.length) continue;
  console.log(`\n${file}`);
  for (const [line, kind, text] of hits) {
    console.log(`  ${String(line).padStart(4)}  ${kind.padEnd(12)} ${text.slice(0, 100)}`);
    total++;
  }
}
console.log(`\n${total} candidate${total === 1 ? "" : "s"} in ${files.length} files.`);
