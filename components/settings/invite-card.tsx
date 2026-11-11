"use client";

import { useState } from "react";
import { Check, Copy, Mail, X } from "lucide-react";
import { useInviteActions, useInvites } from "@/lib/queries/invites";
import { useFormatter, useTranslations } from "next-intl";

/**
 * Invite one person into this space.
 *
 * There is no transactional email yet, so the invite is delivered by the person
 * sending it: they copy a link and send it however they already talk. The link
 * is a convenience — what actually lets someone in is signing up with the
 * invited address.
 */
export function InviteCard() {
  const t = useTranslations("settings");
  const format = useFormatter();
  const { data, isLoading } = useInvites();
  const { invite, revoke } = useInviteActions();
  const [email, setEmail] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const invites = data?.invites ?? [];
  const full = data ? data.members + invites.length >= data.max : false;

  async function copyLink(token: string) {
    await navigator.clipboard.writeText(`${window.location.origin}/login?invite=${token}`);
    setCopied(token);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-surface p-3.5 shadow-soft">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
          <Mail className="h-[18px] w-[18px]" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-fg">{t("inviteTitle")}</p>
          <p className="text-xs text-muted">{t("inviteDesc")}</p>
        </div>
      </div>

      {!isLoading && !full && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            invite.mutate(email, { onSuccess: () => setEmail("") });
          }}
          className="flex flex-col gap-2 sm:flex-row"
        >
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("inviteEmailPlaceholder")}
            aria-label={t("inviteEmailLabel")}
            className="h-10 min-w-0 flex-1 rounded-pill bg-surface-2 px-4 text-sm text-fg placeholder:text-subtle outline-none focus-visible:ring-2 focus-visible:ring-focus"
          />
          <button
            type="submit"
            disabled={invite.isPending || !email.trim()}
            className="h-10 shrink-0 cursor-pointer rounded-pill bg-fg px-4 text-sm font-semibold text-bg transition-colors hover:bg-fg/85 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {invite.isPending ? t("inviteSending") : t("inviteSend")}
          </button>
        </form>
      )}

      {invite.isError && (
        <p role="alert" className="text-xs text-danger">
          {invite.error instanceof Error ? invite.error.message : t("inviteFailed")}
        </p>
      )}

      {full && invites.length === 0 && <p className="text-xs text-muted">{t("inviteFull")}</p>}

      {invites.length > 0 && (
        <ul className="flex flex-col divide-y divide-border rounded-lg bg-surface-2 px-1">
          {invites.map((i) => (
            <li key={i.id} className="flex items-center gap-2 p-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-fg">{i.email}</p>
                <p className="text-xs text-subtle">
                  {t("invitePending", {
                    date: format.dateTime(new Date(i.expires_at), {
                      day: "numeric",
                      month: "long",
                    }),
                  })}
                </p>
              </div>
              <button
                onClick={() => copyLink(i.token)}
                aria-label={t("inviteCopy", { email: i.email })}
                className="shrink-0 cursor-pointer rounded-full p-2 text-muted transition-colors hover:bg-surface hover:text-fg"
              >
                {copied === i.token ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </button>
              <button
                onClick={() => revoke.mutate(i.id)}
                aria-label={t("inviteRevoke", { email: i.email })}
                className="shrink-0 cursor-pointer rounded-full p-2 text-muted transition-colors hover:bg-danger/10 hover:text-danger"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
