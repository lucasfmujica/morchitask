"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";

/**
 * Drops the query string and fragment before a page view leaves the browser.
 *
 * The funnel needs to know which page was seen, never what was in its URL:
 * a query string is where an OAuth error, a search term or a one-off token
 * would ride along to a third party. Exported for the test.
 */
export function stripQuery(event: BeforeSendEvent): BeforeSendEvent {
  const url = new URL(event.url);
  url.search = "";
  url.hash = "";
  return { ...event, url: url.toString() };
}

/** Vercel Web Analytics with `stripQuery` applied. A client component only
 *  because `beforeSend` is a function, which a server layout cannot pass. */
export function PageAnalytics() {
  return <Analytics beforeSend={stripQuery} />;
}
