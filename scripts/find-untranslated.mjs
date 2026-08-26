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
const ALLOWED =
  /^(?:[\s\d.,:;+\-–—/%·×()[\]{}]*|Morchitask|Google|Spotify|esc|[A-Z]|⌘K|↑|↓|⏎|Enter|Escape|Tab|Backspace|Delete|Arrow(?:Up|Down|Left|Right)|Premium|Promise)$/;

/** Tailwind classes, CSS values and framework literals — most of the noise. */
const CSSISH =
  /(^|\s)(flex|grid|inline|block|hidden|absolute|relative|fixed|sticky|rounded|border|bg-|text-|font-|tracking-|leading-|shadow|gap-|p[xytblr]?-|m[xytblr]?-|[hw]-|min-|max-|top-|bottom-|left-|right-|inset|z-|overflow|cursor-|transition|duration-|ease-|animate-|opacity-|ring-|outline|divide-|space-|truncate|shrink|grow|items-|justify-|self-|order-|col-|row-|snap-|touch-|pointer-events|whitespace|tabular-nums|sr-only|backdrop|placeholder:|hover:|focus|group|peer|md:|lg:|sm:|dark:|use client|use server|noopener|repeating-linear|var\(--|min-width|max-width)/;

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

  // Prose sitting in a plain string literal — a ternary inside JSX, a `label:`
  // on an object, an argument to a toast. Invisible to the two passes above,
  // and where the leftovers hid the longest.
  for (const m of src.matchAll(/"([^"\\\n]{3,})"/g)) {
    const text = m[1];
    if (ALLOWED.test(text)) continue;
    if (!/\p{L}{2}/u.test(text)) continue;
    // A single word only counts when it looks like a word: an accent, or a
    // capitalised first letter. "Foco" is copy; "focus" is an identifier.
    const oneWord = !/\s/.test(text);
    if (oneWord && !/[áéíóúñÁÉÍÓÚÑ¿¡]/.test(text) && !/^[A-ZÁ-Ú][a-zá-úñ]{2,}$/u.test(text))
      continue;
    if (CSSISH.test(text)) continue;
    if (/[{}`$=<>[\]]/.test(text)) continue; // the regex ran through code, not a string
    if (/^[a-z-]+\/[a-z0-9-]+$/.test(text)) continue; // a mime type
    hits.push([lineOf(src, m.index), "string", text]);
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
