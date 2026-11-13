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
 * Font: the bundled default (Noto Sans), not Schibsted Grotesk. Loading the
 * brand face would mean fetching it from Google at build time, which turns a
 * network hiccup into a failed deploy for a social card.
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

export function renderOgCard() {
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
        <div style={{ fontSize: 40, letterSpacing: -1 }}>{"Morchitask"}</div>
      </div>

      <div style={{ display: "flex", fontSize: 84, lineHeight: 1.02, letterSpacing: -3 }}>
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
    ogSize,
  );
}
