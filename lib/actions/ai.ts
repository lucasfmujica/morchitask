"use server";

import { auth } from "@/lib/auth";
import { AiError, breakdownTask, planDay } from "@/lib/ai";
import { BreakdownInput, PlanInput, consumeQuota, type PlanProposal } from "@/lib/ai-proposals";
import { todayISO } from "@/lib/date";

/**
 * Claude helpers, as server actions. They return `{ ok, ... }` instead of
 * throwing: Next hides thrown messages in production, and the whole point of
 * the error here is a sentence the person can act on.
 */

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

/** Per person, per day. Generous for real use; stops a runaway loop. */
const DAILY_LIMIT = { breakdown: 30, plan: 10 } as const;
// Module memory: resets on cold start. A guard, not a billing control.
const usage = new Map<string, number>();

const ERRORS = {
  not_configured:
    "La IA todavía no está configurada: falta la clave ANTHROPIC_API_KEY en el servidor.",
  no_answer: "Claude no devolvió una propuesta esta vez. Probá de nuevo.",
  api: "No pudimos hablar con Claude ahora. Probá de nuevo en un rato.",
  limit: "Llegaste al límite de usos de IA por hoy. Mañana se renueva.",
  invalid: "Faltan datos para pedirle esto a Claude.",
  unknown: "Algo salió mal con la IA. Probá de nuevo.",
} as const;

async function requireUser() {
  const session = await auth();
  if (!session?.householdId || !session.user?.id) throw new Error("unauthorized");
  return { userId: session.user.id };
}

async function run<T>(kind: keyof typeof DAILY_LIMIT, fn: () => Promise<T>): Promise<Result<T>> {
  const { userId } = await requireUser();
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: ERRORS.not_configured };
  if (!consumeQuota(usage, `${kind}:${userId}:${todayISO()}`, DAILY_LIMIT[kind])) {
    return { ok: false, error: ERRORS.limit };
  }
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof AiError) return { ok: false, error: ERRORS[e.code] };
    console.error("[ai]", e);
    return { ok: false, error: ERRORS.unknown };
  }
}

/** Propose checklist items for a task. Nothing is saved here. */
export async function suggestChecklist(input: {
  title: string;
  notes?: string | null;
  existing?: string[];
}): Promise<Result<string[]>> {
  const parsed = BreakdownInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: ERRORS.invalid };
  return run("breakdown", () => breakdownTask(parsed.data));
}

/** Propose time-blocks for the day. Nothing is saved here either. */
export async function suggestDayPlan(input: PlanInput): Promise<Result<PlanProposal>> {
  const parsed = PlanInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: ERRORS.invalid };
  return run("plan", () => planDay(parsed.data));
}
