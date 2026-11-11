import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { launchMetrics } from "@/lib/db/queries/admin-metrics";
import { LaunchMetricsView } from "@/components/admin/launch-metrics-view";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * The launch funnel, for the allowlisted admins only.
 *
 * Logged-out visitors never get here (`proxy.ts` sends them to /login like any
 * other app route). Everyone else who is signed in but not on `ADMIN_EMAILS`
 * gets a 404, not a 403: a "forbidden" page confirms there is something here
 * worth getting into. The check runs before the query, so a non-admin request
 * never reads anything across households.
 *
 * Not linked from the sidebar on purpose.
 */
export default async function AdminMetricsPage() {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) notFound();

  return <LaunchMetricsView metrics={await launchMetrics()} />;
}
