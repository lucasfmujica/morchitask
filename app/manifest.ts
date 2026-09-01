import type { MetadataRoute } from "next";

/**
 * Known limitation: one manifest per origin.
 *
 * A manifest is fetched once, by URL, and there are no language prefixes in
 * this app's paths (see `i18n/request.ts` for why — `start_url`, the service
 * worker's push navigation and `proxy.ts` all hardcode routes). So the
 * installed app's name and description stay in Spanish whatever language the
 * interface is set to. It shows on the home-screen icon and the install
 * prompt, nowhere else. Fixing it needs per-locale routes, which is a bigger
 * change than the payoff.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Morchitask",
    short_name: "Morchi",
    description: "Planificá tu día con calma. Productividad para organizarse juntos.",
    start_url: "/today",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f7f8fa",
    theme_color: "#0d9488",
    lang: "es",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
