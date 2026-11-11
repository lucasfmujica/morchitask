import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

/**
 * Crawl the marketing pages, nothing else.
 *
 * The app routes would only ever answer a crawler with a redirect to /login,
 * so listing them costs crawl budget for nothing; the API is listed so a
 * logged-out 307 from a data route never ends up in an index. This is not a
 * security boundary (robots.txt is advice, and it tells everyone where the
 * app lives): `proxy.ts` is the boundary.
 */
const APP_PATHS = [
  "/api/",
  "/auth/",
  "/share",
  "/login",
  "/today",
  "/day",
  "/week",
  "/month",
  "/plan",
  "/shutdown",
  "/backlog",
  "/metas",
  "/routines",
  "/focus",
  "/settings",
  "/resumen",
  "/review",
  "/billing",
  "/dev-preview",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: APP_PATHS },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
