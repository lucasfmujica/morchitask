import type { MetadataRoute } from "next";

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
    // "Compartir → Morchitask" from other apps (installed PWA only). The OS
    // POSTs the share to app/share/route.ts, which files it in the backlog.
    share_target: {
      action: "/share",
      method: "POST",
      enctype: "multipart/form-data",
      params: {
        title: "title",
        text: "text",
        url: "url",
        files: [{ name: "files", accept: ["image/*", "application/pdf"] }],
      },
    },
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
