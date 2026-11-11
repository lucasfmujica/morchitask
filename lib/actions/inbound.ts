"use server";

import { requireSession } from "@/lib/actions/session";
import { inboundAddress } from "@/lib/inbound";

/** Your private forwarding address, or null while capture by email isn't set up. */
export async function getInboundAddress(): Promise<string | null> {
  const { userId } = await requireSession();
  const secret = process.env.INBOUND_EMAIL_SECRET;
  const domain = process.env.INBOUND_EMAIL_DOMAIN;
  if (!secret || !domain || !process.env.INBOUND_EMAIL_WEBHOOK_SECRET) return null;
  return inboundAddress(userId, secret, domain);
}
