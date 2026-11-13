"use server";

import { getLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { AiError, breakdownTask, parseCapture, planDay } from "@/lib/ai";
import { hasWriteAccess } from "@/lib/billing";
import { isBillingEnabled } from "@/lib/billing-config";
import { CaptureInput, type CapturedTask } from "@/lib/capture";
import { BreakdownInput, PlanInput, type PlanProposal } from "@/lib/ai-proposals";
import { consumeAiQuota } from "@/lib/db/queries/ai-usage";
import { todayISO } from "@/lib/date";
import { toLocale } from "@/lib/locale";

/**
 * Claude helpers, as server actions. They return `{ ok, ... }` instead of
 * throwing: Next hides thrown messages in production, and the whole point of
 * the error here is something the person can act on. It travels as a code —
 * the screen turns it into words (`ai.errors.*` in messages/).
 */

export type AiFailure =
  | "not_configured"
  | "no_answer"
  | "api"
  | "limit"
  | "locked"
  | "invalid"
  | "unknown";
type Result<T> = { ok: true; data: T } | { ok: false; error: AiFailure };

/** Per person, per day. Generous for real use; stops a runaway loop. Counted
 *  in the database (`consumeAiQuota`), so it holds across server instances. */
const DAILY_LIMIT = { breakdown: 30, plan: 10, capture: 40 } as const;

async function requireUser() {
  const session = await auth();
  if (!session?.householdId || !session.user?.id) throw new Error("unauthorized");
  return { userId: session.user.id, householdId: session.householdId, access: session.access };
}

async function run<T>(kind: keyof typeof DAILY_LIMIT, fn: () => Promise<T>): Promise<Result<T>> {
  const { userId, householdId, access } = await requireUser();
  // Every call costs money, so it sits behind the same gate as every write.
  // Checked before the quota so a locked-out call does not spend a use.
  if (!hasWriteAccess(access, isBillingEnabled())) return { ok: false, error: "locked" };
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "not_configured" };
  if (!(await consumeAiQuota(householdId, userId, kind, todayISO(), DAILY_LIMIT[kind]))) {
    return { ok: false, error: "limit" };
  }
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof AiError) return { ok: false, error: e.code };
    console.error("[ai]", e);
    return { ok: false, error: "unknown" };
  }
}

/** Propose checklist items for a task. Nothing is saved here. */
export async function suggestChecklist(input: {
  title: string;
  notes?: string | null;
  existing?: string[];
}): Promise<Result<string[]>> {
  const parsed = BreakdownInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const locale = toLocale(await getLocale());
  return run("breakdown", () => breakdownTask(parsed.data, locale));
}

/** Propose time-blocks for the day. Nothing is saved here either. */
export async function suggestDayPlan(input: PlanInput): Promise<Result<PlanProposal>> {
  const parsed = PlanInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const locale = toLocale(await getLocale());
  return run("plan", () => planDay(parsed.data, locale));
}

/** Read a dictated paragraph into proposed tasks. Nothing is saved here. */
export async function parseDictation(input: CaptureInput): Promise<Result<CapturedTask[]>> {
  const parsed = CaptureInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const locale = toLocale(await getLocale());
  return run("capture", () => parseCapture(parsed.data, locale));
}
