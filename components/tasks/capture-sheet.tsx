"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Mic, X } from "lucide-react";
import { parseDictation } from "@/lib/actions/ai";
import { splitDictation, type CapturedTask } from "@/lib/capture";
import { DEFAULT_TIMEZONE, blockInstant, todayISO } from "@/lib/date";
import { formatMinutes } from "@/lib/format";
import { orderForAppend } from "@/lib/ordering";
import { useMe } from "@/lib/queries/profiles";
import { taskKeys, useCreateTask } from "@/lib/queries/tasks";
import { useCreateBlockOnDay } from "@/lib/queries/task-blocks";
import { syncBlockCalendar } from "@/lib/queries/calendar";
import type { Channel, Task } from "@/lib/queries/types";
import { useToast } from "@/lib/stores/toast";
import { useDateLabels } from "@/lib/use-date-labels";
import { useHydrated } from "@/lib/use-hydrated";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/modal-dialog";
import { minutesToHHMM } from "@/components/day/use-agenda-scheduling";

/**
 * The browser's speech API, where it exists. Typed by hand: the DOM lib only
 * ships part of it, and it lives under a webkit prefix in Safari and Chrome.
 * On iPhone it is NOT available inside an installed (home-screen) app — there
 * the keyboard's own dictation button fills the textarea instead, which is why
 * the textarea is the real input and the mic is a convenience.
 */
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<SpeechResultLike> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};
type SpeechResultLike = { isFinal: boolean; 0: { transcript: string } };
type RecognitionCtor = new () => Recognition;

function speechCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

type Proposal = CapturedTask & { on: boolean };

/** The level meter's bar heights (% of its 40px), from the canvas. Decorative:
 *  the speech API exposes no audio level, so the bars breathe on a loop. */
const WAVE = [
  30, 55, 40, 80, 60, 95, 45, 70, 35, 85, 50, 65, 40, 90, 55, 75, 30, 60, 85, 45, 70, 40, 95, 55,
  65, 35, 80, 50, 60, 40, 70, 30,
];

/** m:ss, for how long the mic has been listening. */
function clock(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

/**
 * "Decilo de corrido": dictate or type several things at once, see what was
 * understood as separate tasks, fix or untick what's wrong, create the rest.
 *
 * A modal sheet on ink (bottom sheet on a phone), so it opens on top of
 * wherever you were instead of at the foot of a long list.
 *
 * Nothing is created until the last button. Claude reads the paragraph when
 * it's configured; when it isn't (or fails), the composer's own parser splits it
 * by phrases so the sheet still works offline from the AI.
 */
export function CaptureSheet({
  viewDate,
  channels,
  viewTasks,
  open: openProp,
  onOpenChange,
}: {
  /** Where tasks land when nothing was said about the day (null = backlog). */
  viewDate: string | null;
  channels: Channel[];
  viewTasks: Task[];
  /** Controlled: the parent owns the trigger (Hoy opens it from the composer's mic). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const t = useTranslations("capture");
  const tai = useTranslations("ai");
  const locale = useLocale();
  const labels = useDateLabels();
  const qc = useQueryClient();
  const create = useCreateTask();
  const createBlock = useCreateBlockOnDay();
  const connected = !!useMe().data?.google_calendar_connected;
  const toast = useToast();

  const [openState, setOpenState] = useState(false);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : openState;
  const setOpen = (v: boolean) => (controlled ? onOpenChange?.(v) : setOpenState(v));
  const [text, setText] = useState("");
  const [items, setItems] = useState<Proposal[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  // Seconds of listening, shown where the canvas shows "0:09".
  const [heardSec, setHeardSec] = useState(0);
  const recRef = useRef<Recognition | null>(null);
  const titleId = useId();

  // The speech API only exists in the browser; reading it before hydration would
  // render a mic the server never drew.
  const canListen = useHydrated() && !!speechCtor();
  useEffect(() => () => recRef.current?.stop(), []);
  useEffect(() => {
    if (!listening) return;
    const id = setInterval(() => setHeardSec((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [listening]);

  function reset() {
    recRef.current?.stop();
    setText("");
    setItems(null);
    setNote(null);
    setLoading(false);
    setHeardSec(0);
  }

  function close() {
    reset();
    setOpen(false);
  }

  function toggleListen() {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const Ctor = speechCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = locale === "es" ? "es-AR" : "en-US";
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e) => {
      let said = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) said += e.results[i][0].transcript;
      }
      if (said.trim())
        setText((prev) => (prev.trim() ? `${prev.trim()}. ${said.trim()}` : said.trim()));
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  }

  async function understand() {
    recRef.current?.stop();
    const body = text.trim();
    if (!body) return;
    setLoading(true);
    setNote(null);
    const today = todayISO();
    // The action itself can throw (offline phone, a server error page): that
    // used to leave the sheet stuck on "Leyendo…". Treat it like any other
    // AI failure and fall back to the phrase splitter.
    const res = await parseDictation({
      text: body,
      today,
      channels: channels.map((c) => c.name),
    }).catch(() => ({ ok: false as const, error: "unknown" as const }));
    let found: CapturedTask[];
    if (res.ok && res.data.length > 0) {
      found = res.data;
    } else {
      // Claude unavailable, out of quota or empty-handed: split by phrases.
      found = splitDictation(body, { today, channels });
      if (!res.ok) setNote(`${tai(`errors.${res.error}`)} ${t("fallback")}`);
    }
    setItems(found.map((f) => ({ ...f, on: true })));
    setLoading(false);
  }

  function createSelected() {
    if (!items) return;
    // A title you cleared while editing counts as unticked.
    const chosen = items
      .filter((i) => i.on && i.title.trim())
      .map((i) => ({ ...i, title: i.title.trim() }));
    const today = todayISO();
    const orders = new Map<string | null, number[]>();
    const ordersFor = (day: string | null) => {
      if (!orders.has(day)) {
        const list =
          day === viewDate
            ? viewTasks
            : (qc.getQueryData<Task[]>(day ? taskKeys.date(day) : taskKeys.backlog) ?? []);
        orders.set(
          day,
          list.map((x) => x.sort_order),
        );
      }
      return orders.get(day)!;
    };

    for (const item of chosen) {
      const target = item.plannedDate ?? (item.time ? (viewDate ?? today) : viewDate);
      const dayOrders = ordersFor(target);
      const sortOrder = orderForAppend(dayOrders);
      dayOrders.push(sortOrder);
      const channelId = item.channelName
        ? (channels.find((c) => c.name === item.channelName)?.id ?? null)
        : null;
      create.mutate(
        {
          title: item.title,
          plannedDate: target,
          channelId,
          timeEstimateMin: item.estimateMin,
          priority: item.priority,
          sortOrder,
        },
        {
          onSuccess: (task) => {
            if (!item.time || !target) return;
            const [h, m] = item.time.split(":").map(Number);
            createBlock.mutate(
              {
                date: target,
                taskId: task.id,
                startISO: blockInstant(target, item.time, DEFAULT_TIMEZONE),
                endISO: blockInstant(
                  target,
                  minutesToHHMM(h * 60 + m + (item.estimateMin ?? 30)),
                  DEFAULT_TIMEZONE,
                ),
              },
              {
                onSuccess: (block) => {
                  if (connected) {
                    syncBlockCalendar({ action: "upsert", blockId: block.id }).catch(() => {});
                  }
                },
              },
            );
          },
        },
      );
    }
    toast(t("created", { n: chosen.length }));
    close();
  }

  function patch(i: number, change: Partial<Proposal>) {
    setItems((prev) => (prev ? prev.map((p, k) => (k === i ? { ...p, ...change } : p)) : prev));
  }

  const selected = items?.filter((i) => i.on && i.title.trim()).length ?? 0;
  const heard = !listening && heardSec > 0 && !!text.trim();

  if (!open) {
    if (controlled) return null;
    return (
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        className="self-start rounded-pill"
      >
        <Mic className="h-4 w-4" aria-hidden />
        {t("open")}
      </Button>
    );
  }

  const cta =
    "h-[52px] w-full cursor-pointer rounded-pill bg-fit-ink font-bold text-ink shadow-ink-cta transition-opacity disabled:cursor-default disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-fit-from";

  return (
    <ModalDialog
      onClose={close}
      labelledBy={titleId}
      className="bg-ink text-on-ink md:w-[560px] md:max-w-[calc(100%-32px)]"
    >
      <div className="flex flex-col gap-[18px] p-[22px] pb-[max(22px,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-2.5">
          <h2 id={titleId} className="mr-auto font-display text-base font-semibold">
            {t("title")}
          </h2>
          <span className="font-mono text-2xs text-on-ink-muted" aria-live="polite">
            {listening ? t("listening") : heardSec > 0 ? clock(heardSec) : null}
          </span>
          <button
            type="button"
            onClick={close}
            aria-label={t("close")}
            className="-mr-2 flex h-9 w-9 cursor-pointer items-center justify-center rounded-pill text-on-ink-muted transition-colors hover:bg-ink-3 hover:text-on-ink focus-visible:outline-2 focus-visible:outline-ink-fit-from"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {items === null ? (
          <>
            {canListen && (
              <div className="flex flex-col items-center gap-4 py-2">
                <button
                  type="button"
                  onClick={toggleListen}
                  aria-label={listening ? t("stop") : t("listen")}
                  aria-pressed={listening}
                  className={cn(
                    "flex h-[88px] w-[88px] cursor-pointer items-center justify-center rounded-pill transition-[background] duration-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink-fit-from",
                    listening ? "animate-listen bg-ink-fit-from" : "bg-fit-ink",
                  )}
                >
                  {listening ? (
                    <span className="h-[26px] w-[26px] rounded-[7px] bg-ink" />
                  ) : (
                    <svg
                      width="30"
                      height="30"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="var(--color-ink)"
                      strokeWidth={1.5}
                      strokeLinecap="round"
                      aria-hidden
                    >
                      <rect x="5.5" y="1.5" width="5" height="8.5" rx="2.5" />
                      <path d="M3 7.5a5 5 0 0 0 10 0M8 12.5v2" />
                    </svg>
                  )}
                </button>
                <div className="flex h-10 items-center gap-[3px]" aria-hidden>
                  {WAVE.map((h, i) => (
                    <span
                      key={i}
                      style={{
                        maxHeight: `${h}%`,
                        animationDelay: listening ? `${i * 0.05}s` : undefined,
                      }}
                      className={cn(
                        "h-full w-[3px] origin-center rounded-[3px]",
                        listening
                          ? "animate-wave bg-fit-ink-bar"
                          : heard
                            ? "scale-y-[.3] bg-ink-fit-to"
                            : "scale-y-[.3] bg-ink-line",
                      )}
                    />
                  ))}
                </div>
              </div>
            )}
            {/* The real input. On an installed iPhone app there is no speech
                API, and the keyboard's own mic types straight in here. */}
            <div className="flex flex-col gap-2">
              <label htmlFor="capture-text" className="text-xs text-on-ink-muted">
                {t("hint")}
              </label>
              <textarea
                id="capture-text"
                autoFocus
                rows={4}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t("placeholder")}
                className="min-h-[110px] resize-none rounded-[20px] bg-ink-2 px-4 py-3.5 text-[15px] leading-[23px] text-on-ink-soft outline-none placeholder:text-on-ink-muted focus-visible:ring-2 focus-visible:ring-ink-fit-from"
              />
            </div>
            <button
              type="button"
              onClick={understand}
              disabled={!text.trim() || loading}
              className={cta}
            >
              {loading ? t("reading") : t("understand")}
            </button>
          </>
        ) : (
          <>
            <p className="animate-type m-0 text-[15px] leading-[23px] text-on-ink-soft">
              {t("quote", { text: text.trim() })}
            </p>
            {note && (
              <p className="rounded-[14px] bg-ink-2 px-3 py-2.5 text-2xs text-on-ink-muted">
                {note}
              </p>
            )}
            {items.length === 0 ? (
              <p className="text-sm text-on-ink-muted">{t("nothing")}</p>
            ) : (
              <div className="flex flex-col gap-1 rounded-[20px] bg-ink-2 p-2">
                <span className="px-2.5 pt-2 pb-1 text-[11px] font-semibold tracking-[.06em] text-on-ink-muted uppercase">
                  {t("understood", { n: items.length })}
                </span>
                <ul className="flex flex-col gap-1">
                  {items.map((item, i) => {
                    const meta = [
                      item.plannedDate ? labels.shortDayLabel(item.plannedDate) : null,
                      item.time,
                      item.estimateMin != null ? formatMinutes(item.estimateMin) : null,
                      item.channelName,
                    ].filter(Boolean);
                    return (
                      <li
                        key={i}
                        style={{ animationDelay: `${i * 120 + 200}ms` }}
                        className={cn(
                          "flex animate-up items-center gap-2.5 rounded-[14px] px-3 py-2.5 transition-[background,opacity] duration-200",
                          item.on ? "bg-ink-3" : "bg-transparent opacity-55",
                        )}
                      >
                        <button
                          type="button"
                          aria-pressed={item.on}
                          aria-label={t("include", { title: item.title })}
                          onClick={() => patch(i, { on: !item.on })}
                          className={cn(
                            "flex h-[22px] w-[22px] shrink-0 cursor-pointer items-center justify-center rounded-pill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-fit-from",
                            item.on
                              ? "bg-fit-ink"
                              : "shadow-[inset_0_0_0_1.5px_var(--color-ink-line)]",
                          )}
                        >
                          {item.on && (
                            <svg
                              width="10"
                              height="10"
                              viewBox="0 0 16 16"
                              fill="none"
                              stroke="var(--color-ink)"
                              strokeWidth={2.8}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="animate-pop"
                              aria-hidden
                            >
                              <path d="m3.5 8.5 3 3 6-7" />
                            </svg>
                          )}
                        </button>
                        <span className="flex min-w-0 flex-1 flex-col gap-1">
                          {/* Editable in place: a misheard word shouldn't
                              mean dictating the whole thing again. */}
                          <input
                            value={item.title}
                            onChange={(e) => patch(i, { title: e.target.value })}
                            aria-label={t("titleLabel")}
                            className="-mx-1 rounded-md bg-transparent px-1 text-xs font-semibold text-on-ink outline-none focus-visible:ring-2 focus-visible:ring-ink-fit-from"
                          />
                          {meta.length > 0 && (
                            <span className="truncate text-[11px] text-on-ink-muted tabular-nums">
                              {meta.join(" · ")}
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setItems(null)}
                className="h-[52px] shrink-0 cursor-pointer rounded-pill px-4 text-sm font-semibold text-on-ink-muted transition-colors hover:text-on-ink focus-visible:outline-2 focus-visible:outline-ink-fit-from"
              >
                {t("edit")}
              </button>
              <button
                type="button"
                onClick={createSelected}
                disabled={selected === 0}
                className={cta}
              >
                {t("create", { n: selected })}
              </button>
            </div>
          </>
        )}
      </div>
    </ModalDialog>
  );
}
