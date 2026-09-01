"use client";

import { Bell, Clock } from "lucide-react";
import { usePushNotifications } from "@/lib/queries/push";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

/** Toggles for push: the daily "plan your day" reminder + per-task reminders. */
export function NotificationsCard() {
  const t = useTranslations("settings");
  const { supported, enabled, busy, prefs, enable, disable, setTaskReminders } =
    usePushNotifications();

  return (
    <div className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface">
      <Row
        icon={<Bell className="h-5 w-5" aria-hidden />}
        title={t("dailyReminder")}
        desc={supported ? t("dailyReminderDesc") : t("dailyReminderUnsupported")}
        on={enabled && prefs.dailyPlan !== false}
        disabled={!supported || busy}
        onToggle={() => (enabled && prefs.dailyPlan !== false ? disable() : enable())}
        label={t("dailyReminderLabel")}
      />
      <Row
        icon={<Clock className="h-5 w-5" aria-hidden />}
        title={t("taskReminders")}
        desc={t("taskRemindersDesc")}
        on={!!prefs.taskReminders}
        disabled={!supported || busy}
        onToggle={() => setTaskReminders(!prefs.taskReminders)}
        label={t("taskRemindersLabel")}
      />
    </div>
  );
}

function Row({
  icon,
  title,
  desc,
  on,
  disabled,
  onToggle,
  label,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  on: boolean;
  disabled: boolean;
  onToggle: () => void;
  label: string;
}) {
  const t = useTranslations("settings");
  return (
    <div className="flex items-center gap-3 p-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-fg">{title}</p>
        <p className="text-xs text-muted">{desc}</p>
      </div>
      <button
        onClick={onToggle}
        disabled={disabled}
        aria-pressed={on}
        aria-label={on ? t("turnOff", { what: label }) : t("turnOn", { what: label })}
        className="shrink-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
      >
        <span
          className={cn(
            "relative block h-6 w-11 rounded-full transition-colors",
            on ? "bg-primary" : "bg-surface-2",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-surface shadow-soft transition-transform",
              on && "translate-x-5",
            )}
          />
        </span>
      </button>
    </div>
  );
}
