"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { connectStint, disconnectStint, getStintCard } from "@/lib/actions/stint";
import { taskKeys } from "@/lib/queries/tasks";
import { channelKeys } from "@/lib/queries/channels";
import { Button } from "@/components/ui/button";

/**
 * Connect your Stint tasks. The server returns null for anyone whose email is
 * not on STINT_LINK_EMAILS, and then this renders nothing at all.
 */
export function StintCard() {
  const t = useTranslations("settings");
  const format = useFormatter();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["stint-card"], queryFn: () => getStintCard() });
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"token" | "network" | null>(null);
  const card = q.data;
  if (!card) return null;

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ["stint-card"] });
    await qc.invalidateQueries({ queryKey: taskKeys.all });
    await qc.invalidateQueries({ queryKey: channelKeys.all });
  }

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const r = await connectStint(token);
      if (!r.ok) return setError(r.error);
      setToken("");
      await refresh();
    } catch {
      setError("network");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!confirm(t("stintDisconnectConfirm"))) return;
    setBusy(true);
    try {
      await disconnectStint();
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-[18px] bg-surface p-3.5 shadow-soft">
      <div className="flex items-center gap-2.5">
        <Link2 className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
        <p className="min-w-0 flex-1 text-sm font-semibold text-fg">{t("stintTitle")}</p>
        {card.connected && (
          <Button size="sm" variant="secondary" disabled={busy} onClick={disconnect}>
            {t("stintDisconnect")}
          </Button>
        )}
      </div>
      <p className="text-xs leading-[17px] text-muted">{t("stintDesc")}</p>
      {card.connected ? (
        <p className="text-xs text-muted">
          {card.lastSyncedAt
            ? t("stintSynced", { when: format.relativeTime(new Date(card.lastSyncedAt)) })
            : t("stintConnected")}
        </p>
      ) : (
        <div className="flex items-center gap-2 rounded-pill bg-surface-2 py-1 pr-1 pl-4">
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={t("stintTokenPlaceholder")}
            aria-label={t("stintTokenPlaceholder")}
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent font-mono text-xs outline-none"
          />
          <Button size="sm" variant="primary" disabled={busy || !token.trim()} onClick={connect}>
            {t("stintConnect")}
          </Button>
        </div>
      )}
      {error && (
        <p className="text-xs text-danger">
          {error === "token" ? t("stintErrorToken") : t("stintErrorNetwork")}
        </p>
      )}
    </div>
  );
}
