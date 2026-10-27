import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_LOCALE, type Locale } from "@/lib/locale";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  BreakdownOutput,
  PlanOutput,
  cleanBreakdown,
  validatePlan,
  type BreakdownInput,
  type PlanInput,
  type PlanProposal,
} from "@/lib/ai-proposals";

/**
 * Server-only Claude client and the two prompts. The key comes from
 * ANTHROPIC_API_KEY (Vercel env + .env.local); without it every helper fails
 * with `AiError("not_configured")` instead of crashing.
 */

/** Small, fast and cheap — a checklist doesn't need more. */
export const BREAKDOWN_MODEL = "claude-haiku-5-5";
/** Planning juggles times, gaps and priorities — worth the bigger model. */
export const PLAN_MODEL = "claude-sonnet-5-5";

export type AiErrorCode = "not_configured" | "no_answer" | "api";

export class AiError extends Error {
  constructor(public code: AiErrorCode) {
    super(code);
  }
}

let client: Anthropic | null = null;

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new AiError("not_configured");
  client ??= new Anthropic({ apiKey });
  return client;
}

/** How each language is named to Claude, so it answers in the reader's one. */
const ANSWER_IN: Record<Locale, string> = {
  es: "Español rioplatense",
  en: "English (even though these instructions are in Spanish)",
};

const breakdownSystem = (
  locale: Locale,
) => `Sos un asistente de productividad. Te paso una tarea (título y notas) y la desglosás en un checklist de pasos concretos.

- Entre 3 y 8 pasos, en el orden en que se harían.
- Cada paso empieza con un verbo en infinitivo ("Llamar a…", "Comparar…") y entra en una línea (máx. ~80 caracteres).
- Idioma: ${ANSWER_IN[locale]}. Sin numerar ni usar viñetas.
- No repitas pasos que ya estén en el checklist actual.
- Si la tarea es muy simple, devolvé solo los pasos que realmente aporten.`;

/** Break a task down into checklist items. Returns 0–8 cleaned items. */
export async function breakdownTask(
  input: BreakdownInput,
  locale: Locale = DEFAULT_LOCALE,
): Promise<string[]> {
  const anthropic = getClient();
  const existing = input.existing.length
    ? `\n\nChecklist actual:\n${input.existing.map((t) => `- ${t}`).join("\n")}`
    : "";
  const notes = input.notes?.trim() ? `\nNotas: ${input.notes.trim()}` : "";

  const res = await call(() =>
    anthropic.messages.parse({
      model: BREAKDOWN_MODEL,
      max_tokens: 2000,
      system: breakdownSystem(locale),
      output_config: { effort: "low", format: zodOutputFormat(BreakdownOutput) },
      messages: [{ role: "user", content: `Tarea: ${input.title}${notes}${existing}` }],
    }),
  );
  if (res.stop_reason === "refusal" || !res.parsed_output) throw new AiError("no_answer");
  return cleanBreakdown(res.parsed_output.items, input.existing);
}

const planSystem = (
  locale: Locale,
) => `Sos un asistente que arma la agenda del día. Te paso las tareas pendientes (con su índice y los minutos que faltan agendar), los horarios ya ocupados, la ventana disponible y la capacidad de la persona.

Proponé bloques de tiempo:
- Un bloque por tarea como máximo; "task" es el índice de la tarea, "start" la hora de inicio en formato HH:MM (24 h), "durationMin" los minutos.
- Nunca pises un horario ocupado ni salgas de la ventana.
- No superes la capacidad que queda; si no entra todo, dejá afuera lo menos importante.
- Poné lo que más requiere foco temprano, agrupá lo corto y dejá 5–10 min de aire entre bloques largos cuando haya lugar.
- En "note" explicá el criterio en una frase corta. Idioma de "note": ${ANSWER_IN[locale]}.`;

/** Ask Claude for a schedule and return only what fits without overlaps. */
export async function planDay(
  input: PlanInput,
  locale: Locale = DEFAULT_LOCALE,
): Promise<PlanProposal> {
  const anthropic = getClient();
  const pending = input.tasks.filter((t) => t.remainingMin > 0);
  const { capacityLeftMin } = input;

  const prompt = [
    `Día: ${input.date}`,
    `Ventana disponible: ${clock(input.fromMin)}–${clock(input.toMin)}`,
    `Capacidad que queda: ${capacityLeftMin} min`,
    "",
    "Ocupado:",
    ...(input.busy.length
      ? [...input.busy]
          .sort((a, b) => a.startMin - b.startMin)
          .map((b) => `- ${clock(b.startMin)}–${clock(b.endMin)}`)
      : ["- (nada)"]),
    "",
    "Tareas (índice · minutos que faltan · título):",
    ...input.tasks.map((t, i) => `${i} · ${t.remainingMin} min · ${t.title}`),
  ].join("\n");

  if (pending.length === 0) return { blocks: [], skippedTaskIds: [], note: "" };

  const res = await call(() =>
    anthropic.messages.parse({
      model: PLAN_MODEL,
      max_tokens: 4000,
      system: planSystem(locale),
      output_config: { effort: "low", format: zodOutputFormat(PlanOutput) },
      messages: [{ role: "user", content: prompt }],
    }),
  );
  if (res.stop_reason === "refusal" || !res.parsed_output) throw new AiError("no_answer");
  return validatePlan(res.parsed_output, {
    tasks: input.tasks,
    busy: input.busy,
    fromMin: input.fromMin,
    toMin: input.toMin,
    capacityLeftMin,
  });
}

/** Map SDK failures to our codes; a bad key reads like a missing one. */
async function call<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new AiError("not_configured");
    if (e instanceof Anthropic.APIError) throw new AiError("api");
    throw e;
  }
}

function clock(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}
