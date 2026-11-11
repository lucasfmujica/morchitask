import { z } from "zod";
import { AiError, parseCapture } from "@/lib/ai";
import { consumeQuota } from "@/lib/ai-proposals";
import { splitDictation, type CapturedTask } from "@/lib/capture";
import { todayISO } from "@/lib/date";
import { cleanEmailText, isAuthorizedInbound, userFromAddress } from "@/lib/inbound";
import { orderForAppend } from "@/lib/ordering";
import { myChannels } from "@/lib/db/queries/channels";
import { getProfile } from "@/lib/db/queries/profiles";
import { backlogTasks, insertTask, updateTask } from "@/lib/db/queries/tasks";

/**
 * Mail forwarded to someone's private address becomes tasks in their backlog.
 *
 * Provider-agnostic on purpose: anything that can POST JSON with a shared
 * secret can feed it (docs/INBOUND_EMAIL.md has a Cloudflare Email Worker that
 * does). Fails closed like the payment webhook: no secret or no domain
 * configured means every request is refused.
 *
 * Who the tasks belong to comes ONLY from the signed recipient address, never
 * from the sender: "From" is trivially forged, the HMAC in the address isn't.
 *
 * Everything lands in the backlog, never on a day: the backlog is the inbox, and
 * a mail shouldn't be able to rearrange someone's afternoon. A date the text
 * mentions goes in "Vence" so it isn't lost.
 *
 * 2xx means "stop retrying", so an address that isn't ours gets 200 (a retry
 * can't fix it) and a database blip gets 5xx.
 */

const Payload = z.object({
  to: z.union([z.string(), z.array(z.string())]),
  from: z.string().max(320).optional(),
  subject: z.string().max(2000).optional(),
  text: z.string().max(100_000).optional(),
});

/** Per person, per day. A mail loop shouldn't be able to bury a backlog. */
const DAILY_LIMIT = 60;
const usage = new Map<string, number>();
const MAX_TASKS_PER_MAIL = 3;

export async function POST(req: Request) {
  const secret = process.env.INBOUND_EMAIL_WEBHOOK_SECRET;
  const signing = process.env.INBOUND_EMAIL_SECRET;
  const domain = process.env.INBOUND_EMAIL_DOMAIN;
  if (!secret || !signing || !domain) {
    return new Response("inbound email not configured", { status: 503 });
  }
  if (!isAuthorizedInbound(req.headers.get("authorization"), secret)) {
    return new Response("unauthorized", { status: 403 });
  }

  const parsed = Payload.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ ignored: "malformed payload" });
  const mail = parsed.data;

  const recipients = Array.isArray(mail.to) ? mail.to : mail.to.split(",");
  const userId = recipients.map((r) => userFromAddress(r, signing, domain)).find(Boolean) ?? null;
  if (!userId) return Response.json({ ignored: "unknown recipient" });

  const profile = await getProfile(userId);
  if (!profile?.household_id) return Response.json({ ignored: "no profile" });
  const householdId = profile.household_id;

  const today = todayISO();
  if (!consumeQuota(usage, `${userId}:${today}`, DAILY_LIMIT)) {
    return Response.json({ ignored: "daily limit" });
  }

  const { subject, body } = cleanEmailText(mail.subject, mail.text);
  if (!subject && !body) return Response.json({ ignored: "empty" });

  const channels = await myChannels(householdId, userId);
  const text = [subject, body].filter(Boolean).join("\n\n").slice(0, 4000);

  let found: CapturedTask[] = [];
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      found = await parseCapture({ text, today, channels: channels.map((c) => c.name) });
    } catch (e) {
      if (!(e instanceof AiError)) throw e;
    }
  }
  // Without Claude, one task per mail: the subject reads like a to-do far more
  // often than the body's sentences do.
  if (found.length === 0) {
    found = subject
      ? [
          {
            title: subject,
            plannedDate: null,
            time: null,
            estimateMin: null,
            priority: null,
            channelName: null,
          },
        ]
      : splitDictation(body, { today, channels }).slice(0, 1);
  }

  const orders = (await backlogTasks(householdId, userId)).map((t) => t.sort_order);
  const notes = [mail.from ? `${mail.from}` : null, subject, body].filter(Boolean).join("\n\n");
  const created: string[] = [];
  for (const task of found.slice(0, MAX_TASKS_PER_MAIL)) {
    const sortOrder = orderForAppend(orders);
    orders.push(sortOrder);
    const channelId = task.channelName
      ? (channels.find((c) => c.name === task.channelName)?.id ?? null)
      : null;
    const row = await insertTask(householdId, userId, {
      title: task.title,
      plannedDate: null,
      channelId,
      timeEstimateMin: task.estimateMin,
      priority: task.priority,
      sortOrder,
    });
    await updateTask(householdId, row.id, { notes, due_date: task.plannedDate });
    created.push(row.id);
  }

  return Response.json({ ok: true, created: created.length });
}
