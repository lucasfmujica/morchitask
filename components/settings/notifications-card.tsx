"use client";

import { usePushNotifications } from "@/lib/queries/push";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

/** Toggles for push: the daily "plan your day" reminder + per-task reminders. */
export function NotificationsCard() {
  const t = useTranslations("settings");
  const { supported, enabled, busy, prefs, enable, disable, setTaskReminders } =
    usePushNotifications();

  return (
    // The section's title sits inside the white card, as the canvas has it:
    // the two switches are one surface, not two cards.
    <div className="flex flex-col gap-4 rounded-[22px] bg-surface p-[18px]">
      <h2 className="font-display text-base font-semibold text-fg">{t("notifications")}</h2>
      {/* Side by side when the card runs the page's full width, so each
          switch stays close to the words it answers to. */}
      <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-2 @2xl:gap-x-10">
        <Row
          title={t("dailyReminder")}
          desc={supported ? t("dailyReminderDesc") : t("dailyReminderUnsupported")}
          on={enabled && prefs.dailyPlan !== false}
          disabled={!supported || busy}
          onToggle={() => (enabled && prefs.dailyPlan !== false ? disable() : enable())}
          label={t("dailyReminderLabel")}
        />
        <Row
          title={t("taskReminders")}
          desc={t("taskRemindersDesc")}
          on={!!prefs.taskReminders}
          disabled={!supported || busy}
          onToggle={() => setTaskReminders(!prefs.taskReminders)}
          label={t("taskRemindersLabel")}
        />
      </div>
    </div>
  );
}

function Row({
  title,
  desc,
  on,
  disabled,
  onToggle,
  label,
}: {
  title: string;
  desc: string;
  on: boolean;
  disabled: boolean;
  onToggle: () => void;
  label: string;
}) {
  const t = useTranslations("settings");
  return (
    <div className="flex items-center gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-xs leading-normal font-semibold text-fg">{title}</p>
        <p className="text-2xs leading-4 text-muted">{desc}</p>
      </div>
      <button
        onClick={onToggle}
        disabled={disabled}
        aria-pressed={on}
        aria-label={on ? t("turnOff", { what: label }) : t("turnOn", { what: label })}
        className="shrink-0 cursor-pointer rounded-pill outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-40"
      >
        <span
          className={cn(
            "relative block h-[26px] w-11 rounded-pill transition-colors duration-300",
            on ? "bg-fit" : "bg-border",
          )}
        >
          <span
            className={cn(
              // A fixed white knob, not bg-surface: in dark mode the surface is dark
              // and the knob would vanish into the off track.
              "absolute top-[3px] left-[3px] h-5 w-5 rounded-full bg-on-scrim shadow-[0_1px_3px_rgb(var(--shadow-color)/0.25)] transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]",
              on && "translate-x-[18px]",
            )}
          />
        </span>
      </button>
    </div>
  );
}
