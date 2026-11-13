"use client";

import { useState } from "react";
import { Check, Copy, X } from "lucide-react";
import { useInviteActions, useInvites } from "@/lib/queries/invites";
import { useFormatter, useTranslations } from "next-intl";
import { inviteLink } from "@/lib/invite-link";

/**
 * Invite one person into this space.
 *
 * There is no transactional email yet, so the invite is delivered by the person
 * sending it: they copy a link and send it however they already talk. What
 * lets someone in is the invited address: signing up with it joins on the
 * spot, and an existing account with it chooses on the link's page whether to
 * join (see /invite/[token]).
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
    await navigator.clipboard.writeText(inviteLink(window.location.origin, token));
    setCopied(token);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-[22px] bg-surface px-4 pt-4 pb-3.5">
      <div className="flex flex-col gap-[3px]">
        <h2 className="font-display text-[15px] font-semibold text-fg">{t("inviteTitle")}</h2>
        <p className="text-2xs leading-[17px] text-muted">{t("inviteDesc")}</p>
      </div>

      {!isLoading && !full && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            invite.mutate(email, { onSuccess: () => setEmail("") });
          }}
          className="flex gap-2"
        >
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("inviteEmailPlaceholder")}
            aria-label={t("inviteEmailLabel")}
            className="h-[38px] min-w-0 flex-1 rounded-pill bg-bg px-4 text-sm text-fg placeholder:text-subtle outline-none focus-visible:ring-2 focus-visible:ring-focus"
          />
          <button
            type="submit"
            disabled={invite.isPending || !email.trim()}
            className="h-[38px] shrink-0 cursor-pointer rounded-pill bg-fg px-4 text-2xs font-semibold text-surface transition-colors hover:bg-fg/85 disabled:cursor-not-allowed disabled:opacity-40"
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
        <ul className="flex flex-col gap-1.5">
          {invites.map((i) => (
            <li
              key={i.id}
              className="flex items-center gap-2 rounded-[14px] bg-bg py-2.5 pr-2 pl-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-fg">{i.email}</p>
                <p className="text-2xs text-subtle">
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
                className="flex h-[30px] shrink-0 cursor-pointer items-center gap-1.5 rounded-pill bg-surface px-3 text-2xs font-semibold text-fg transition-colors hover:bg-border"
              >
                {copied === i.token ? (
                  <Check className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  <Copy className="h-3.5 w-3.5" aria-hidden />
                )}
                {copied === i.token ? t("inviteCopied") : t("inviteCopyShort")}
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
      {invites.length > 0 && (
        <p className="text-2xs leading-[17px] text-muted">{t("inviteLinkNote")}</p>
      )}
    </div>
  );
}
