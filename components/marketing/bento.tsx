import type { CSSProperties, ReactNode } from "react";
import { useTranslations } from "next-intl";
import { formatMinutes } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DEMO_CATEGORY_COLORS, DEMO_DAY, circumference } from "./demo";

/**
 * "Cómo funciona": eight tiles, each a working piece of the app drawn at
 * its real size and looping through the one gesture it is about. The tiles
 * are illustrations, so their moving parts are aria-hidden; the heading and
 * sentence on each tile carry the meaning.
 */

const delay = (s: number): CSSProperties => ({ animationDelay: `${s}s` });

const SPAN = {
  4: "min-[900px]:col-span-4",
  5: "min-[900px]:col-span-5",
  6: "min-[900px]:col-span-6",
  7: "min-[900px]:col-span-7",
  12: "min-[900px]:col-span-12",
} as const;

export const tileTitle = "font-display text-[22px] leading-tight font-bold tracking-[-0.02em]";

/** The app's well: a grey tray with a heading, holding a white card. */
function WellTile({
  span,
  title,
  body,
  children,
}: {
  span: keyof typeof SPAN;
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <article className={cn("flex flex-col rounded-[28px] bg-surface-2 p-2", SPAN[span])}>
      <div className="px-[18px] pt-[18px] pb-3.5">
        <h3 className={tileTitle}>{title}</h3>
        <p className="mt-1.5 text-[15px] leading-[22px] text-muted">{body}</p>
      </div>
      {children}
    </article>
  );
}

const mono = "font-mono text-[11px]";

function AgendaTile() {
  const t = useTranslations("marketing");
  const hours = ["09:00", "10:00", "11:00", "12:00", "13:00"];
  return (
    <WellTile span={7} title={t("bento.agendaTitle")} body={t("bento.agendaBody")}>
      <div
        aria-hidden
        className="relative h-[300px] overflow-hidden rounded-[22px] bg-surface py-4 pr-4 pl-16"
      >
        <div className="absolute top-3 right-4 left-4 h-2 overflow-hidden rounded-pill bg-surface-2">
          {/* Resting state is the overflow, which is what reduced motion keeps. */}
          <div className="animate-overbar bg-hatch h-full w-full rounded-pill" />
        </div>
        {hours.map((h, i) => (
          <div
            key={h}
            className="absolute right-4 left-4 flex items-center gap-2.5"
            style={{ top: 36 + i * 56 }}
          >
            <span className={cn(mono, "w-[38px] text-subtle")}>{h}</span>
            <span className="h-px flex-1 bg-surface-2" />
          </div>
        ))}
        <Block
          className="top-11 h-[52px] bg-agenda-1"
          title={t("demo.homepage")}
          from="09:00"
          to="10:00"
        />
        <Block
          className="top-[156px] h-[52px] bg-agenda-4"
          title={t("bento.groceries")}
          from="11:00"
          to="12:00"
        />
        <Block
          className="animate-dragin top-[212px] h-[72px] bg-agenda-2 shadow-[0_10px_24px_-10px_rgb(var(--shadow-color)/0.35)]"
          title={t("bento.proposal")}
          from="12:00"
          to="15:00"
        />
        <div className="absolute top-32 right-4 left-14 flex items-center">
          <span className="animate-now h-2.5 w-2.5 rounded-pill bg-accent" />
          <span className="h-0.5 flex-1 bg-accent" />
        </div>
      </div>
    </WellTile>
  );
}

function Block({
  className,
  title,
  from,
  to,
}: {
  className: string;
  title: string;
  from: string;
  to: string;
}) {
  const t = useTranslations("marketing");
  return (
    <div className={cn("absolute right-4 left-16 rounded-[14px] px-3 py-2", className)}>
      <div className="text-[13px] font-semibold">{title}</div>
      <div className={cn(mono, "text-muted")}>{t("bento.range", { from, to })}</div>
    </div>
  );
}

function RingTile() {
  const t = useTranslations("marketing");
  const r = 88;
  const c = circumference(r);
  const planned = 340;
  return (
    <article
      className={cn(
        "flex flex-col items-center gap-[18px] rounded-[28px] bg-[linear-gradient(180deg,var(--wash-mint),var(--wash-mint-2)_55%,var(--surface))] p-[26px] text-center",
        SPAN[5],
      )}
    >
      <h3 className={tileTitle}>{t("ritual2.title")}</h3>
      <div className="relative h-[210px] w-[210px]" aria-hidden>
        <svg width="210" height="210" viewBox="0 0 210 210" className="-rotate-90">
          <defs>
            <linearGradient id="bento-ring" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" style={{ stopColor: "var(--fit-from)" }} />
              <stop offset="1" style={{ stopColor: "var(--primary)" }} />
            </linearGradient>
          </defs>
          <circle
            cx="105"
            cy="105"
            r={r}
            strokeWidth="16"
            style={{ fill: "var(--surface)", stroke: "var(--surface-2)" }}
          />
          <circle
            className="animate-spin-to"
            cx="105"
            cy="105"
            r={r}
            fill="none"
            stroke="url(#bento-ring)"
            strokeWidth="16"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c}
            style={{ "--ring-to": c * (1 - planned / DEMO_DAY.capacityMin) } as CSSProperties}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-[36px] leading-tight font-bold tracking-[-0.02em] tabular-nums">
            {formatMinutes(planned)}
          </span>
          <span className="text-xs font-semibold text-primary">
            {t("ritual2.spare", { time: formatMinutes(DEMO_DAY.capacityMin - planned) })}
          </span>
        </div>
      </div>
      <p className="max-w-[300px] text-[15px] leading-[22px] text-muted">{t("bento.ringBody")}</p>
    </article>
  );
}

const chip = "rounded-pill px-2.5 py-[5px] text-2xs";

function VoiceTile() {
  const t = useTranslations("marketing");
  return (
    <WellTile span={4} title={t("bento.voiceTitle")} body={t("bento.voiceBody")}>
      <div aria-hidden className="flex flex-1 flex-col gap-3.5 rounded-[22px] bg-surface p-[18px]">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-pill bg-fg text-bg">
            <svg
              width="15"
              height="15"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            >
              <rect x="5.5" y="1.5" width="5" height="8.5" rx="2.5" />
              <path d="M3 7.5a5 5 0 0 0 10 0M8 12.5v2" />
            </svg>
          </span>
          <span className="block overflow-hidden whitespace-nowrap">
            <span className="animate-type block overflow-hidden font-mono text-2xs whitespace-nowrap">
              {t("bento.voiceTyped")}
            </span>
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className={cn(chip, "animate-chip bg-mint-soft font-semibold")} style={delay(0)}>
            {t("bento.tomorrow")}
          </span>
          <span className={cn(chip, "animate-chip bg-surface-2 font-mono")} style={delay(0.15)}>
            {"10:00"}
          </span>
          <span className={cn(chip, "animate-chip bg-surface-2 font-mono")} style={delay(0.3)}>
            {formatMinutes(30)}
          </span>
          <span
            className={cn(chip, "animate-chip font-semibold text-on-primary")}
            style={{ ...delay(0.45), background: DEMO_CATEGORY_COLORS.work }}
          >
            {t("demo.work")}
          </span>
        </div>
      </div>
    </WellTile>
  );
}

/** Google Calendar both ways: a meeting read from the calendar, and a block
 *  written back to it. Took the mail tile's slot, which promised forwarding to
 *  an address most people never get (it only exists where the inbound domain
 *  is configured). */
function CalendarTile() {
  const t = useTranslations("marketing");
  return (
    <WellTile span={4} title={t("bento.calendarTitle")} body={t("bento.calendarBody")}>
      <div
        aria-hidden
        className="flex flex-1 flex-col gap-2.5 rounded-[22px] bg-surface px-[18px] py-4"
      >
        <div className="flex items-center gap-2.5 rounded-[14px] bg-bg px-3 py-2.5">
          <span
            className="w-[3px] self-stretch rounded-pill"
            style={{ background: DEMO_CATEGORY_COLORS.work }}
          />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-sm font-semibold">{t("bento.calendarMeeting")}</span>
            <span className={cn(mono, "text-muted")}>
              {t("bento.range", { from: "11:00", to: "12:00" })}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-[5px] text-[11px] font-semibold text-muted">
            <svg
              width="12"
              height="12"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2 3h12v11H2zM2 6.5h12M5.5 1.5v3M10.5 1.5v3" />
            </svg>
            {t("bento.calendarFrom")}
          </span>
        </div>
        <div className="animate-slot flex items-center gap-2.5 rounded-[14px] bg-mint-soft px-3 py-2.5">
          <span className="w-[3px] self-stretch rounded-pill bg-primary" />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-sm font-semibold">{t("demo.homepage")}</span>
            <span className={cn(mono, "text-on-wash")}>
              {t("bento.range", { from: "09:00", to: "10:30" })}
            </span>
          </span>
          <span
            className="animate-chip flex shrink-0 items-center gap-[5px] text-[11px] font-semibold text-on-wash"
            style={delay(0.2)}
          >
            <svg
              className="animate-sync"
              width="12"
              height="12"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M13.5 8a5.5 5.5 0 0 1-9.6 3.7M2.5 8a5.5 5.5 0 0 1 9.6-3.7M12.5 1.8v2.8H9.7M3.5 14.2v-2.8h2.8" />
            </svg>
            {t("bento.calendarSynced")}
          </span>
        </div>
      </div>
    </WellTile>
  );
}

function ReplanTile() {
  const t = useTranslations("marketing");
  const rows = [
    { task: t("demo.homepage"), from: "09:00", to: "11:30" },
    { task: t("demo.accountant"), from: "10:00", to: "13:30" },
    { task: t("bento.run"), from: "12:00", to: "18:00" },
  ];
  return (
    <WellTile span={4} title={t("bento.replanTitle")} body={t("bento.replanBody")}>
      <div aria-hidden className="flex flex-1 flex-col rounded-[22px] bg-surface px-[18px] py-3.5">
        {rows.map((r, i) => (
          <div
            key={r.task}
            className="flex items-center gap-2.5 border-t border-surface-2 py-2.5 text-sm"
          >
            <span className="flex-1 font-semibold">{r.task}</span>
            <span className="animate-strike font-mono text-2xs text-subtle">{r.from}</span>
            <span
              className="animate-newtime rounded-pill bg-mint-soft px-2 py-0.5 font-mono text-2xs"
              style={delay(i * 0.15)}
            >
              {r.to}
            </span>
          </div>
        ))}
      </div>
    </WellTile>
  );
}

function WeekTile() {
  const t = useTranslations("marketing");
  const days = [
    {
      dow: t("bento.mon"),
      num: 9,
      fill: "w-full bg-fit-bar",
      load: t("bento.doneCount", { count: 2 }),
      loadCls: "text-primary",
      col: "opacity-75",
      numCls: "",
    },
    {
      dow: t("bento.tue"),
      num: 10,
      fill: "w-[74%] bg-fit-bar",
      load: formatMinutes(310),
      loadCls: "text-muted",
      col: "",
      numCls: "",
    },
    {
      dow: t("bento.today"),
      num: 11,
      fill: "w-[67%] bg-fit-bar",
      load: formatMinutes(280),
      loadCls: "text-primary",
      col: "shadow-[inset_0_0_0_2px_var(--fit-from)]",
      numCls:
        "bg-fit text-on-primary shadow-[0_4px_12px_color-mix(in_srgb,var(--primary)_35%,transparent)]",
    },
    {
      dow: t("bento.thu"),
      num: 12,
      fill: "w-full bg-hatch",
      load: `+${formatMinutes(40)}`,
      loadCls: "text-accent",
      col: "",
      numCls: "",
    },
    {
      dow: t("bento.fri"),
      num: 13,
      fill: "w-0",
      load: t("bento.free"),
      loadCls: "text-muted",
      col: "",
      numCls: "bg-marker text-on-marker",
    },
  ];
  return (
    <WellTile span={6} title={t("bento.weekTitle")} body={t("bento.weekBody")}>
      <div aria-hidden className="grid grid-cols-5 gap-1.5">
        {days.map((d) => (
          <div
            key={d.num}
            className={cn(
              "flex min-w-0 flex-col gap-2.5 rounded-[18px] bg-surface px-2.5 py-3",
              d.col,
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-1">
              <span className="text-[11px] font-semibold tracking-[0.06em] text-muted">
                {d.dow}
              </span>
              <span
                className={cn(
                  "flex h-7 w-7 flex-none items-center justify-center rounded-pill font-display text-sm font-bold",
                  d.numCls,
                )}
              >
                {d.num}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-pill bg-border">
              <div className={cn("animate-fill h-full rounded-pill", d.fill)} />
            </div>
            <span className={cn("text-[11px] font-semibold", d.loadCls)}>{d.load}</span>
          </div>
        ))}
      </div>
    </WellTile>
  );
}

function FocusTile() {
  const t = useTranslations("marketing");
  const r = 64;
  const c = circumference(r);
  return (
    <article
      className={cn(
        "flex flex-wrap items-center gap-7 rounded-[28px] bg-ink p-[26px] text-on-ink",
        SPAN[6],
      )}
    >
      <div aria-hidden className="relative h-[150px] w-[150px] flex-none">
        <svg width="150" height="150" viewBox="0 0 150 150" className="-rotate-90">
          <circle
            cx="75"
            cy="75"
            r={r}
            fill="none"
            strokeWidth="10"
            style={{ stroke: "color-mix(in srgb, var(--on-ink) 12%, transparent)" }}
          />
          <circle
            cx="75"
            cy="75"
            r={r}
            fill="none"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * 0.373}
            style={{ stroke: "var(--fit-from)" }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center font-display text-[30px] font-bold">
          {"18:24"}
        </span>
      </div>
      <div className="flex min-w-0 flex-[1_1_200px] flex-col gap-2.5">
        <h3 className={tileTitle}>{t("bento.focusTitle")}</h3>
        <p className="text-[15px] leading-[22px] text-on-ink/70">{t("bento.focusBody")}</p>
        <div aria-hidden className="flex h-6 items-end gap-1">
          {[0, 0.2, 0.4, 0.1].map((d) => (
            <span
              key={d}
              className="animate-eq h-6 w-[5px] rounded-[3px] bg-fit-from"
              style={delay(d)}
            />
          ))}
        </div>
      </div>
    </article>
  );
}

function ForTwoTile() {
  const t = useTranslations("marketing");
  const partner = t("bento.partner");
  return (
    <article className={cn("rounded-[28px] bg-surface-2 p-2", SPAN[12])}>
      <div className="flex flex-wrap items-center gap-[18px] rounded-[22px] bg-surface px-6 py-[22px]">
        <div aria-hidden className="flex">
          <span
            className="flex h-10 w-10 items-center justify-center rounded-pill border-[3px] border-surface font-bold text-on-primary"
            style={{ background: DEMO_CATEGORY_COLORS.work }}
          >
            {"L"}
          </span>
          <span
            className="-ml-2.5 flex h-10 w-10 items-center justify-center rounded-pill border-[3px] border-surface font-bold text-on-primary"
            style={{ background: DEMO_CATEGORY_COLORS.home }}
          >
            {partner.charAt(0)}
          </span>
        </div>
        <div className="min-w-0 flex-[1_1_320px]">
          <h3 className={tileTitle}>{t("bento.twoTitle")}</h3>
          <p className="mt-1 text-[15px] leading-[22px] text-muted">{t("bento.twoBody")}</p>
        </div>
        <span className="flex h-11 max-w-full items-center gap-2.5 rounded-pill bg-bg pr-2 pl-4 text-sm">
          <span className="truncate">
            {t.rich("bento.twoActivity", {
              name: partner,
              task: t("bento.groceries"),
              b: (chunks) => <b className="font-semibold">{chunks}</b>,
            })}
          </span>
          <span
            aria-hidden
            className="animate-heart flex h-[30px] w-[30px] flex-none items-center justify-center rounded-pill bg-surface text-accent"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 14s-5.5-3.3-5.5-7.2A3 3 0 0 1 8 4.6a3 3 0 0 1 5.5 2.2C13.5 10.7 8 14 8 14z" />
            </svg>
          </span>
        </span>
      </div>
    </article>
  );
}

export function Bento() {
  return (
    <div className="grid grid-cols-1 gap-3 min-[900px]:grid-cols-12">
      <AgendaTile />
      <RingTile />
      <VoiceTile />
      <CalendarTile />
      <ReplanTile />
      <WeekTile />
      <FocusTile />
      <ForTwoTile />
    </div>
  );
}
