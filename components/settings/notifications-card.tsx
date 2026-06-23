"use client";

import { Bell } from "lucide-react";
import { usePushNotifications } from "@/lib/queries/push";
import { cn } from "@/lib/utils";

/** Toggle for the daily "plan your day" push reminder (8:00). */
export function NotificationsCard() {
  const { supported, enabled, busy, enable, disable } = usePushNotifications();

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
        <Bell className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-fg">Recordatorio diario</p>
        <p className="text-xs text-muted">
          {supported
            ? "Un aviso a las 8:00 para planificar tu día."
            : "Instalá la app (Compartir → Agregar a inicio) para activar las notificaciones."}
        </p>
      </div>
      <button
        onClick={() => (enabled ? disable() : enable())}
        disabled={!supported || busy}
        aria-pressed={enabled}
        aria-label={enabled ? "Desactivar recordatorio" : "Activar recordatorio"}
        className="shrink-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
      >
        <span
          className={cn(
            "relative block h-6 w-11 rounded-full transition-colors",
            enabled ? "bg-primary" : "bg-surface-2",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-surface shadow-soft transition-transform",
              enabled && "translate-x-5",
            )}
          />
        </span>
      </button>
    </div>
  );
}
