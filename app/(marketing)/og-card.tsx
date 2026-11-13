import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { createTranslator } from "next-intl";
import es from "@/messages/es.json";
import { PRICE_MONTHLY_USD, TRIAL_DAYS, formatUsd } from "@/lib/pricing";

/**
 * The card a shared link unfurls into, for every marketing page.
 *
 * Each page folder has its own `opengraph-image.tsx` that only calls this. A
 * single file at the route group's root is not enough: it applies through
 * inheritance, and a page that sets `openGraph` in its metadata (all of them,
 * for og:url and og:locale) replaces the inherited images wholesale. A file in
 * the page's own segment wins over the page's metadata object instead.
 *
 * One image, in Spanish. Crawlers fetch it without the `/en` header, so a
 * per-language image would need a different URL per page, and the share card
 * is read in a glance: the brand, the promise and the bar matter more than its
 * language. It is built at compile time from the catalog, not per request.
 *
 * Colours are hex because ImageResponse renders outside the page and cannot see
 * the CSS variables. They are the light theme's values from `app/globals.css`
 * (--bg, --surface-2, --fg, --muted, --fit-from, --primary, --marker).
 *
 * Fonts: the wordmark and the headline in Fraunces, the small lines in
 * Figtree, as on the page. Both are checked in next to this file rather than
 * fetched from Google at build time, because a fetch turns a network hiccup
 * into a failed deploy for a social card. They are static cuts (satori cannot
 * read variable axes: Fraunces 600 at optical size 72, Figtree 500) subset to
 * ASCII plus Spanish accents, 27 KB and 18 KB. Both are OFL. Passing `fonts`
 * drops next/og's bundled Noto, so a character outside the subset renders as
 * nothing: if the catalog strings gain one, re-download the subset from
 * fonts.googleapis.com/css2?family=Fraunces:opsz,wght@72,600&text=... (and the
 * same for Figtree:wght@500), with a non-browser User-Agent to get TTF.
 */
const t = createTranslator({ locale: "es", messages: es, namespace: "seo" });

export const ogAlt = t("ogAlt");
export const ogSize = { width: 1200, height: 630 };

const PAPER = "#F4F5F1";
const SURFACE_2 = "#ECEEE8";
const INK = "#1C1F1A";
const MUTED = "#565C52";
const FIT_FROM = "#8FDCA4";
const PRIMARY = "#2C7A4B";
const MARKER = "#F2D24B";

export async function renderOgCard() {
  const dir = join(process.cwd(), "app/(marketing)");
  const [fraunces, figtree] = await Promise.all([
    readFile(join(dir, "fraunces-og-600.ttf")),
    readFile(join(dir, "figtree-og-500.ttf")),
  ]);
  const price = formatUsd(PRICE_MONTHLY_USD, "es");

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: PAPER,
        color: INK,
        fontFamily: "Figtree",
        paddingTop: 72,
        paddingBottom: 72,
        paddingLeft: 80,
        paddingRight: 80,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 18,
            background: `linear-gradient(135deg, ${FIT_FROM}, ${PRIMARY})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width="28" height="28" viewBox="0 0 16 16" fill="none">
            <path
              d="m3.5 8.5 3 3 6-7"
              stroke="#FFFFFF"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div style={{ fontFamily: "Fraunces", fontSize: 40 }}>{"Morchitask"}</div>
      </div>

      <div
        style={{
          display: "flex",
          fontFamily: "Fraunces",
          fontSize: 84,
          lineHeight: 1.05,
          letterSpacing: -1,
        }}
      >
        {t("ogHeadline")}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        {/* The capacity bar: the product's one gradient, meaning "it fits". */}
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ fontSize: 26, color: MUTED, width: 180 }}>{t("ogCapacity")}</div>
          <div
            style={{
              flex: 1,
              height: 40,
              borderRadius: 999,
              background: SURFACE_2,
              display: "flex",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: "72%",
                height: "100%",
                borderRadius: 999,
                background: `linear-gradient(90deg, ${FIT_FROM}, ${PRIMARY})`,
              }}
            />
          </div>
        </div>
        <div style={{ display: "flex" }}>
          <div
            style={{
              display: "flex",
              background: MARKER,
              borderRadius: 8,
              paddingTop: 6,
              paddingBottom: 6,
              paddingLeft: 14,
              paddingRight: 14,
              fontSize: 28,
              transform: "rotate(-1.5deg)",
            }}
          >
            {t("ogPriceLine", { price, days: TRIAL_DAYS })}
          </div>
        </div>
      </div>
    </div>,
    {
      ...ogSize,
      fonts: [
        { name: "Fraunces", data: fraunces, weight: 600, style: "normal" },
        { name: "Figtree", data: figtree, weight: 500, style: "normal" },
      ],
    },
  );
}
