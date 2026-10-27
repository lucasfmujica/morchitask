"use server";

import { getLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { AiError, breakdownTask, planDay } from "@/lib/ai";
import { BreakdownInput, PlanInput, consumeQuota, type PlanProposal } from "@/lib/ai-proposals";
import { todayISO } from "@/lib/date";
import { toLocale } from "@/lib/locale";

/**
 * Claude helpers, as server actions. They return `{ ok, ... }` instead of
 * throwing: Next hides thrown messages in production, and the whole point of
 * the error here is something the person can act on. It travels as a code —
 * the screen turns it into words (`ai.errors.*` in messages/).
 */

export type AiFailure = "not_configured" | "no_answer" | "api" | "limit" | "invalid" | "unknown";
type Result<T> = { ok: true; data: T } | { ok: false; error: AiFailure };

/** Per person, per day. Generous for real use; stops a runaway loop. */
const DAILY_LIMIT = { breakdown: 30, plan: 10 } as const;
// Module memory: resets on cold start. A guard, not a billing control.
const usage = new Map<string, number>();

async function requireUser() {
  const session = await auth();
  if (!session?.householdId || !session.user?.id) throw new Error("unauthorized");
  return { userId: session.user.id };
}

async function run<T>(kind: keyof typeof DAILY_LIMIT, fn: () => Promise<T>): Promise<Result<T>> {
  const { userId } = await requireUser();
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "not_configured" };
  if (!consumeQuota(usage, `${kind}:${userId}:${todayISO()}`, DAILY_LIMIT[kind])) {
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
