"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Mic, Square, X } from "lucide-react";
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

/**
 * "Decilo de corrido": dictate or type several things at once, see what was
 * understood as separate tasks, untick what's wrong, create the rest.
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
  const recRef = useRef<Recognition | null>(null);

  // The speech API only exists in the browser; reading it before hydration would
  // render a mic the server never drew.
  const canListen = useHydrated() && !!speechCtor();
  useEffect(() => () => recRef.current?.stop(), []);

  function reset() {
    recRef.current?.stop();
    setText("");
    setItems(null);
    setNote(null);
    setLoading(false);
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
    const res = await parseDictation({ text: body, today, channels: channels.map((c) => c.name) });
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
    const chosen = items.filter((i) => i.on);
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
    reset();
    setOpen(false);
  }

  const selected = items?.filter((i) => i.on).length ?? 0;

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

  return (
    <section
      aria-label={t("title")}
      className="flex flex-col gap-3 rounded-card border border-border bg-surface p-3 shadow-soft"
    >
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-sm font-semibold">{t("title")}</h2>
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          aria-label={t("close")}
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-pill text-muted hover:bg-surface-2 hover:text-fg"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {items === null ? (
        <>
          <label htmlFor="capture-text" className="text-xs text-muted">
            {t("hint")}
          </label>
          <div className="flex items-start gap-2">
            <textarea
              id="capture-text"
              autoFocus
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t("placeholder")}
              className="min-h-24 flex-1 resize-none rounded-xl bg-surface-2 p-3 text-sm text-fg outline-none placeholder:text-subtle focus-visible:ring-2 focus-visible:ring-focus"
            />
            {canListen && (
              <button
                type="button"
                onClick={toggleListen}
                aria-label={listening ? t("stop") : t("listen")}
                aria-pressed={listening}
                className={cn(
                  "flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-pill transition-colors focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none",
                  listening
                    ? "animate-pulse bg-accent text-on-accent"
                    : "bg-primary text-on-primary hover:bg-primary-hover",
                )}
              >
                {listening ? (
                  <Square className="h-4 w-4" aria-hidden />
                ) : (
                  <Mic className="h-5 w-5" aria-hidden />
                )}
              </button>
            )}
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={understand} disabled={!text.trim() || loading}>
              {loading ? t("reading") : t("understand")}
            </Button>
          </div>
        </>
      ) : (
        <>
          {note && <p className="rounded-xl bg-accent-soft p-2 text-xs text-fg">{note}</p>}
          {items.length === 0 ? (
            <p className="text-sm text-muted">{t("nothing")}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {items.map((item, i) => {
                const meta = [
                  item.plannedDate ? labels.shortDayLabel(item.plannedDate) : null,
                  item.time,
                  item.estimateMin != null ? formatMinutes(item.estimateMin) : null,
                  item.channelName,
                ].filter(Boolean);
                return (
                  <li key={`${item.title}-${i}`}>
                    <button
                      type="button"
                      aria-pressed={item.on}
                      onClick={() =>
                        setItems((prev) =>
                          prev ? prev.map((p, k) => (k === i ? { ...p, on: !p.on } : p)) : prev,
                        )
                      }
                      className={cn(
                        "flex w-full cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-surface-2",
                        !item.on && "opacity-50",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded-pill",
                          item.on
                            ? "bg-primary text-on-primary"
                            : "border-[1.5px] border-border-strong",
                        )}
                      >
                        {item.on && <Check className="h-3 w-3" aria-hidden />}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-medium">{item.title}</span>
                        {meta.length > 0 && (
                          <span className="truncate text-2xs text-muted tabular-nums">
                            {meta.join(" · ")}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex items-center justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={() => setItems(null)}>
              {t("edit")}
            </Button>
            <Button size="sm" onClick={createSelected} disabled={selected === 0}>
              {t("create", { n: selected })}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
