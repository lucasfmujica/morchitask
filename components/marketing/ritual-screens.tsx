"use client";

import { useId, type CSSProperties, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { formatMinutes } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ArrowIcon, CheckIcon } from "./icons";
import { DEMO_CATEGORY_COLORS, DEMO_DAY, circumference } from "./demo";

/**
 * The three ritual screens the hero plays, drawn at phone size (390x844) and
 * scaled down by the player.
 *
 * They are pictures of the app, not the app: the player marks them
 * aria-hidden and inert, so nothing in here is focusable or interactive. The
 * canvas let you toggle the cards; here they sit in the state the canvas opens
 * with, because a control a keyboard can't reach is worse than no control.
 */

const delay = (ms: number): CSSProperties => ({ animationDelay: `${ms}ms` });

function Screen({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-[844px] w-[390px] flex-col overflow-hidden bg-[linear-gradient(180deg,var(--wash-mint)_0%,var(--wash-mint-2)_36%,var(--surface)_66%)] px-5 pt-14 pb-8 text-fg">
      {children}
    </div>
  );
}

/** Back button, the three-step progress and a date or clock on the right. */
function TopBar({ step, right }: { step: 1 | 2 | 3; right: string }) {
  return (
    <div className="flex items-center gap-3.5">
      <span className="flex h-10 w-10 items-center justify-center rounded-pill bg-surface shadow-pill">
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10 3 5 8l5 5" />
        </svg>
      </span>
      <span className="flex flex-1 gap-1.5">
        {[1, 2, 3].map((n) => (
          <span
            key={n}
            className={cn(
              "h-1 flex-1 overflow-hidden rounded-pill",
              n < step ? "bg-fg" : "bg-surface/75",
            )}
          >
            {n === step && <span className="animate-seg block h-full bg-fg" style={delay(200)} />}
          </span>
        ))}
      </span>
      <span className="font-mono text-2xs text-on-wash">{right}</span>
    </div>
  );
}

/** The ink pill each screen ends on: rises in, then breathes. */
function ScreenCta({ children, at }: { children: ReactNode; at: number }) {
  return (
    <span className="animate-up" style={delay(at)}>
      <span className="animate-glow flex h-[54px] items-center gap-2 rounded-pill bg-fg px-[30px] text-[15px] font-semibold text-bg">
        {children}
        <ArrowIcon size={15} />
      </span>
    </span>
  );
}

function Tick({ on, size, at }: { on: boolean; size: number; at?: number }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-pill text-on-primary",
        on ? "bg-fit" : "shadow-[inset_0_0_0_1.5px_var(--border-strong)]",
      )}
      style={{ width: size, height: size }}
    >
      {on && (
        <span className="animate-pop flex" style={at === undefined ? undefined : delay(at)}>
          <CheckIcon size={size < 26 ? 11 : 12} strokeWidth={size < 26 ? 2.6 : 2.4} />
        </span>
      )}
    </span>
  );
}

/** Morning: what slipped from yesterday, two of three picked. */
export function RitualMorning() {
  const t = useTranslations("marketing");
  const items = [
    {
      name: t("demo.accountant"),
      cat: "work",
      min: 30,
      ini: t("ritual1.workInitial"),
      w: "100%",
      on: true,
    },
    {
      name: t("ritual1.fees"),
      cat: "home",
      min: 10,
      ini: t("ritual1.homeInitial"),
      w: "94%",
      on: true,
    },
    {
      name: t("ritual1.dentist"),
      cat: "personal",
      min: 15,
      ini: t("ritual1.personalInitial"),
      w: "88%",
      on: false,
    },
  ] as const;
  const picked = items.filter((i) => i.on).length;

  return (
    <Screen>
      <TopBar step={1} right={t("demo.date")} />
      <div className="mt-9 flex flex-col gap-2.5">
        {items.map((it, i) => (
          <div
            key={it.name}
            className={cn(
              "animate-drop flex items-center gap-3 self-center rounded-[22px] px-3.5 py-3 shadow-card",
              it.on ? "bg-surface" : "bg-surface/60",
            )}
            style={{ width: it.w, ...delay(i * 140) }}
          >
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[13px] font-bold text-on-primary"
              style={{ background: DEMO_CATEGORY_COLORS[it.cat] }}
            >
              {it.ini}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-px">
              <span className="text-sm font-semibold">{it.name}</span>
              <span className="text-2xs text-muted">
                {t("ritual1.meta", { category: t(`demo.${it.cat}`), minutes: it.min })}
              </span>
            </span>
            <Tick on={it.on} size={26} />
          </div>
        ))}
      </div>

      <div
        className="animate-up mt-auto flex flex-col items-center gap-2 text-center"
        style={delay(600)}
      >
        <p className="font-display text-[30px] leading-[34px] font-bold tracking-[-0.02em]">
          {t("ritual1.title")}
        </p>
        <p className="max-w-[290px] text-[15px] leading-[21px] text-muted">{t("ritual1.body")}</p>
      </div>

      <div className="mt-9 flex flex-col items-center gap-3.5">
        <ScreenCta at={900}>{t("ritual1.cta", { count: picked })}</ScreenCta>
        <span className="animate-up text-sm font-medium text-muted" style={delay(1000)}>
          {t("ritual1.skip")}
        </span>
      </div>
    </Screen>
  );
}

/** Midday: how much fits, as a ring against the hours you have. */
export function RitualMidday() {
  const t = useTranslations("marketing");
  const gradientId = useId();
  const r = 96;
  const c = circumference(r);
  const fill = Math.min(DEMO_DAY.plannedRitualMin / DEMO_DAY.capacityMin, 1);
  const cats = ["work", "home", "personal"] as const;

  return (
    <Screen>
      <TopBar step={2} right={t("demo.date")} />

      <div className="relative mt-[34px] h-[230px] w-[230px] self-center">
        <span className="animate-halo absolute inset-0 rounded-pill border-[1.5px] border-surface/90" />
        <span
          className="animate-halo absolute inset-0 rounded-pill border-[1.5px] border-surface/90"
          style={delay(1400)}
        />
        <svg width="230" height="230" viewBox="0 0 230 230" className="relative -rotate-90">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" style={{ stopColor: "var(--fit-from)" }} />
              <stop offset="1" style={{ stopColor: "var(--primary)" }} />
            </linearGradient>
          </defs>
          <circle
            cx="115"
            cy="115"
            r={r}
            strokeWidth="16"
            style={{ fill: "var(--surface)", stroke: "var(--surface-2)" }}
          />
          <circle
            className="animate-ring"
            cx="115"
            cy="115"
            r={r}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth="16"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - fill)}
            style={{ "--ring-from": c } as CSSProperties}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
          <span className="font-display text-[40px] leading-tight font-bold tracking-[-0.02em] tabular-nums">
            {formatMinutes(DEMO_DAY.plannedRitualMin)}
          </span>
          <span className="text-xs font-semibold text-primary">
            {t("ritual2.spare", {
              time: formatMinutes(DEMO_DAY.capacityMin - DEMO_DAY.plannedRitualMin),
            })}
          </span>
        </div>
      </div>

      <div
        className="animate-up mt-[18px] flex items-center justify-center gap-2.5"
        style={delay(400)}
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-pill bg-surface text-lg shadow-pill">
          −
        </span>
        <span className="min-w-32 text-center text-sm font-semibold">
          {t("ritual2.available", { hours: DEMO_DAY.capacityMin / 60 })}
        </span>
        <span className="flex h-9 w-9 items-center justify-center rounded-pill bg-surface text-lg shadow-pill">
          +
        </span>
      </div>

      <div
        className="animate-up mt-auto flex flex-col items-center gap-2 text-center"
        style={delay(600)}
      >
        <p className="font-display text-[30px] leading-[34px] font-bold tracking-[-0.02em]">
          {t("ritual2.title")}
        </p>
        <p className="max-w-[300px] text-[15px] leading-[21px] text-muted">{t("ritual2.body")}</p>
      </div>

      <div className="animate-up mt-5 grid grid-cols-3 gap-2" style={delay(750)}>
        {cats.map((cat) => (
          <div
            key={cat}
            className="flex flex-col gap-1 rounded-[18px] bg-surface/85 px-3.5 py-3 shadow-tile"
          >
            <span className="flex items-center gap-1.5 text-2xs font-semibold text-muted">
              <span
                className="h-2 w-2 rounded-[3px]"
                style={{ background: DEMO_CATEGORY_COLORS[cat] }}
              />
              {t(`demo.${cat}`)}
            </span>
            <span className="font-mono text-[15px]">
              {formatMinutes(DEMO_DAY.byCategoryMin[cat])}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-[26px] flex flex-col items-center gap-3.5">
        <ScreenCta at={900}>{t("ritual2.cta")}</ScreenCta>
        <span className="animate-up text-sm font-medium text-muted" style={delay(1000)}>
          {t("ritual2.hint")}
        </span>
      </div>
    </Screen>
  );
}

/** Night: the day closed, three shutdown steps and a rating. */
export function RitualNight() {
  const t = useTranslations("marketing");
  const left = DEMO_DAY.totalClose - DEMO_DAY.doneClose;
  const steps = [
    {
      label: t("ritual3.review"),
      meta: t("ritual3.reviewMeta", { count: DEMO_DAY.doneClose }),
      on: true,
    },
    { label: t("ritual3.carry"), meta: t("ritual3.carryMeta", { count: left }), on: true },
    { label: t("ritual3.note"), meta: t("ritual3.noteMeta"), on: false },
  ];
  const rating = 4;

  return (
    <Screen>
      <TopBar step={3} right="19:04" />

      <div className="relative mt-9 flex h-[150px] w-[150px] items-center justify-center self-center">
        <span
          className="animate-halo absolute inset-5 rounded-pill border-[1.5px] border-surface/95"
          style={delay(900)}
        />
        <span
          className="animate-halo absolute inset-5 rounded-pill border-[1.5px] border-surface/95"
          style={delay(2200)}
        />
        <span
          className="animate-pop bg-fit relative flex h-[104px] w-[104px] items-center justify-center rounded-pill text-on-primary shadow-[0_14px_34px_color-mix(in_srgb,var(--primary)_35%,transparent),inset_0_2px_0_rgb(255_255_255/0.35)]"
          style={delay(200)}
        >
          <svg width="46" height="46" viewBox="0 0 24 24" fill="none">
            <path
              className="animate-draw"
              d="m5.5 12.5 4 4 9-10"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </div>

      <div
        className="animate-up mt-3.5 flex flex-col items-center gap-1.5 text-center"
        style={delay(500)}
      >
        <p className="font-display text-[30px] leading-[34px] font-bold tracking-[-0.02em]">
          {t("ritual3.title")}
        </p>
        <p className="text-[15px] leading-[21px] text-muted">
          {t("ritual3.body", { done: DEMO_DAY.doneClose, total: DEMO_DAY.totalClose, left })}
        </p>
      </div>

      <div
        className="animate-up mt-[22px] flex flex-col gap-0.5 rounded-2xl bg-surface p-2 shadow-card"
        style={delay(700)}
      >
        {steps.map((s, i) => (
          <div key={s.label} className="flex h-12 items-center gap-3 rounded-[16px] px-3">
            <Tick on={s.on} size={24} at={900 + i * 200} />
            <span className={cn("flex-1 text-sm font-semibold", s.on ? "text-fg" : "text-muted")}>
              {s.label}
            </span>
            <span className="text-2xs text-muted">{s.meta}</span>
          </div>
        ))}
      </div>

      <div className="animate-up mt-[18px] flex flex-col items-center gap-1.5" style={delay(1100)}>
        <span className="text-xs font-semibold text-muted">{t("ritual3.rate")}</span>
        <span className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <span key={n} className="flex h-10 w-10 items-center justify-center">
              <svg
                width="26"
                height="26"
                viewBox="0 0 24 24"
                className={n <= rating ? "" : "scale-[.88]"}
              >
                <path
                  d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2 6.4 20.2l1.1-6.3L2.9 9.5l6.3-.9z"
                  style={{ fill: n <= rating ? "var(--primary)" : "var(--border)" }}
                />
              </svg>
            </span>
          ))}
        </span>
      </div>

      <div className="mt-auto flex flex-col items-center gap-3.5">
        <ScreenCta at={1400}>{t("ritual3.cta")}</ScreenCta>
        <span className="animate-up text-sm font-medium text-muted" style={delay(1600)}>
          {t("ritual3.summary")}
        </span>
      </div>
    </Screen>
  );
}
