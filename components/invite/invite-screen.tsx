"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import Link from "next/link";
import { signIn, signOut } from "next-auth/react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { paddedDate } from "@/lib/format";
import { acceptInvite } from "@/lib/actions/invites";
import type { getInviteView } from "@/lib/actions/invites";
import { invitePath } from "@/lib/invite-link";
import { clearActiveTimersForSignOut } from "@/lib/stores/active-timer";
import { OwnerAvatar } from "@/components/tasks/owner-avatar";
import type { HouseholdMember } from "@/lib/queries/types";
import { cn } from "@/lib/utils";

export type InviteView = Exclude<Awaited<ReturnType<typeof getInviteView>>, null | "member">;

const CHECK = "m3.5 8.5 3 3 6-7";
const LOCK = "M3.5 7.5h9v6.5h-9zM5.5 7.5V5a2.5 2.5 0 0 1 5 0v2.5";
const SWAP = "M2.5 5.5h10l-2.5-2.5M13.5 10.5h-10l2.5 2.5";
const ARROW = "M2.5 8h10M9 4.5 12.5 8 9 11.5";

function Glyph({ d, size = 11, width = 2.2 }: { d: string; size?: number; width?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}

/** The CTA every variant ends on: an ink pill lifted a step at the top, with
 *  the "it fits" glow breathing under it. */
const cta =
  "flex h-[54px] animate-glow items-center justify-center gap-2 rounded-pill bg-linear-to-b from-[color-mix(in_srgb,var(--color-fg)_94%,var(--color-surface))] to-fg text-[15px] font-semibold text-surface disabled:cursor-not-allowed disabled:opacity-60";

/** True when the invite is drawn inside the app's shell (the locked billing
 *  page) rather than as a page of its own. */
const Embedded = createContext(false);

/**
 * The invite's page: the two people, joined by a line that moves until they
 * are in one space, and what joining does. One screen wide on every device,
 * like the sign-in screen it can stand in for.
 */
function Frame({
  tone = "mint",
  expires,
  inviter,
  me,
  joined = false,
  children,
}: {
  tone?: "mint" | "warm";
  expires: string | null;
  inviter: HouseholdMember;
  me: HouseholdMember | null;
  joined?: boolean;
  children: ReactNode;
}) {
  const t = useTranslations("invite");
  const locale = useLocale();
  const embedded = useContext(Embedded);
  const Root = embedded ? "section" : "main";
  return (
    <Root
      className={cn(
        "flex justify-center text-fg",
        embedded ? "mx-auto w-full max-w-[430px] rounded-[28px]" : "min-h-dvh pt-safe pb-safe",
        tone === "warm"
          ? "bg-linear-to-b from-wash-peach via-[color-mix(in_srgb,var(--color-wash-peach)_45%,var(--color-surface))] via-38% to-surface to-66%"
          : "bg-linear-to-b from-wash-mint via-wash-mint-2 via-36% to-surface to-66%",
      )}
    >
      <div
        className={cn(
          "flex w-full max-w-[430px] flex-col px-5 pt-[26px] pb-7",
          embedded ? "min-h-[640px]" : "min-h-dvh",
        )}
      >
        <div className="flex h-8 items-center justify-between">
          <span className="font-display text-[17px] font-semibold tracking-[-0.01em]">
            Morchitask
          </span>
          {expires && (
            <span className="font-mono text-[11px] text-on-wash">
              {t("expires", {
                date: paddedDate(new Date(expires), locale),
              })}
            </span>
          )}
        </div>

        <div aria-hidden className="mt-[22px] flex animate-up items-center [animation-delay:60ms]">
          <span className="rounded-full shadow-[0_0_0_3px_var(--color-surface)]">
            <OwnerAvatar profile={inviter} size={52} />
          </span>
          <svg width="56" height="10" viewBox="0 0 56 10">
            <path
              className={joined ? undefined : "animate-[mt-dash_1.2s_linear_infinite]"}
              d="M4 5h48"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray={joined ? "48 0" : "4 4"}
              style={{
                color: joined
                  ? "var(--color-primary)"
                  : "color-mix(in srgb, var(--color-primary) 45%, var(--color-surface))",
              }}
            />
          </svg>
          {me ? (
            <span className="rounded-full shadow-[0_0_0_3px_var(--color-surface)]">
              <OwnerAvatar profile={me} size={52} />
            </span>
          ) : (
            <span className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-surface text-xl font-bold text-subtle shadow-[0_0_0_3px_var(--color-surface)]">
              {"?"}
            </span>
          )}
          {joined && (
            <span className="ml-2.5 flex h-7 w-7 animate-pop items-center justify-center rounded-full bg-fit text-on-primary">
              <Glyph d={CHECK} size={13} width={2.6} />
            </span>
          )}
        </div>
        {children}
      </div>
    </Root>
  );
}

function Head({ title, lead }: { title: string; lead: ReactNode }) {
  return (
    <div className="mt-[18px] flex animate-up flex-col gap-2 [animation-delay:120ms]">
      <h1 className="font-display text-[31px] leading-[35px] font-semibold tracking-[-0.01em]">
        {title}
      </h1>
      <p className="text-[15px] leading-[22px] text-muted">{lead}</p>
    </div>
  );
}

function Rows({ rows }: { rows: string[] }) {
  return (
    <section className="mt-[18px] animate-up rounded-[28px] bg-surface-2 p-2 [animation-delay:160ms]">
      <div className="flex flex-col gap-2.5 rounded-[22px] bg-surface p-4">
        {rows.map((r) => (
          <span key={r} className="flex gap-2.5 text-xs leading-[19px]">
            <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            {r}
          </span>
        ))}
      </div>
    </section>
  );
}

const Bottom = ({ children }: { children: ReactNode }) => (
  <div className="mt-auto flex flex-col items-stretch gap-2 pt-6">{children}</div>
);

/** The page for someone signed in. `embedded` draws it inside the app's shell:
 *  the proxy keeps a locked account on /billing, so that is where its invite
 *  link lands. */
export function InviteAccept({
  view,
  me,
  embedded = false,
}: {
  view: InviteView;
  me: HouseholdMember;
  embedded?: boolean;
}) {
  return (
    <Embedded.Provider value={embedded}>
      <InviteAcceptBody view={view} me={me} />
    </Embedded.Provider>
  );
}

function InviteAcceptBody({ view, me }: { view: InviteView; me: HouseholdMember }) {
  const t = useTranslations("invite");
  const format = useFormatter();
  const [after, setAfter] = useState<null | "joined" | "declined">(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const name = view.inviter.display_name;
  const space = view.space;
  const long = (iso: string) => format.dateTime(new Date(iso), { day: "numeric", month: "long" });
  const locale = useLocale();
  const short = (iso: string) => paddedDate(new Date(iso), locale);
  const frame = { expires: view.expiresAt, inviter: view.inviter, me };

  async function join() {
    setBusy(true);
    setFailed(false);
    try {
      const res = await acceptInvite(view.token);
      if (!res.ok) {
        // Something changed between loading the page and the click; the page
        // as the server now sees it says what.
        window.location.reload();
        return;
      }
      setAfter("joined");
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  if (after === "joined") {
    return (
      <Frame {...frame} joined>
        <Head title={t("joinedTitle", { space })} lead={t("joinedLead", { name })} />
        <Rows rows={[t("joinedRow1", { n: view.me.taskCount }), t("joinedRow2")]} />
        <Bottom>
          {/* A full load: every query cached so far belongs to the old space. */}
          <a href="/today" className={cta}>
            {t("goToday")}
            <Glyph d={ARROW} size={15} width={1.8} />
          </a>
        </Bottom>
      </Frame>
    );
  }

  if (after === "declined") {
    return (
      <Frame {...frame}>
        <Head
          title={t("declinedTitle")}
          lead={t("declinedLead", { trial: view.me.access?.source === "trial" ? "yes" : "no" })}
        />
        <Rows
          rows={[t("declinedRow1", { date: long(view.expiresAt) }), t("declinedRow2", { name })]}
        />
        <Bottom>
          <Link href="/today" className={cta}>
            {t("goToday")}
            <Glyph d={ARROW} size={15} width={1.8} />
          </Link>
          <button
            type="button"
            onClick={() => setAfter(null)}
            className="h-10 cursor-pointer rounded-pill text-xs font-semibold text-muted"
          >
            {t("back")}
          </button>
        </Bottom>
      </Frame>
    );
  }

  if (view.refusal === "own_plan" && view.mySubscription) {
    const covered = view.theirs?.allowed && view.theirs.source !== "trial" ? "yes" : "no";
    return (
      <Frame {...frame} tone="warm">
        <Head title={t("title", { name })} lead={t("leadConflict", { space })} />
        <section className="mt-[18px] flex animate-up flex-col gap-3 rounded-[28px] bg-surface p-[18px] shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,var(--color-accent)_28%,var(--color-bg))] [animation-delay:220ms]">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"
            >
              <Glyph d="M2 4h12v8.5H2zM2 7h12M4.5 10h2" size={15} width={1.6} />
            </span>
            <span className="font-display text-[19px] font-semibold">{t("conflictTitle")}</span>
          </div>
          <p className="text-xs leading-[19px] text-muted">
            {t.rich("conflictBody", {
              plan: view.mySubscription.interval === "year" ? "year" : "month",
              date: view.mySubscription.periodEnd ? short(view.mySubscription.periodEnd) : "",
              covered,
              space,
              name: view.payerName,
              m: (c) => <span className="font-mono text-fg">{c}</span>,
            })}
          </p>
          <ol className="flex flex-col gap-2">
            {(["conflictStep1", "conflictStep2"] as const).map((k, i) => (
              <li key={k} className="flex items-center gap-2.5 text-xs font-semibold">
                <span
                  className={cn(
                    "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full font-mono text-[11px]",
                    i === 0
                      ? "bg-fg text-surface"
                      : "shadow-[inset_0_0_0_1.5px_var(--color-border-strong)]",
                  )}
                >
                  {i + 1}
                </span>
                {t(k)}
              </li>
            ))}
          </ol>
          <p className="text-2xs leading-[17px] text-muted">{t("conflictRefund")}</p>
        </section>
        <p className="mx-1 mt-3.5 animate-up text-2xs leading-[17px] text-muted [animation-delay:300ms]">
          {t("conflictSwap", { name })}
        </p>
        <Bottom>
          <Link href="/billing" className={cta}>
            {t("goBilling")}
            <Glyph d={ARROW} size={15} width={1.8} />
          </Link>
          <button
            type="button"
            disabled
            aria-disabled="true"
            className="flex h-11 cursor-not-allowed items-center justify-center gap-2 rounded-pill bg-surface/70 text-sm font-semibold text-subtle"
          >
            <Glyph d={LOCK} size={12} width={1.6} />
            {t("join", { space })}
          </button>
        </Bottom>
      </Frame>
    );
  }

  if (view.refusal) {
    const stop =
      view.refusal === "wrong_account"
        ? {
            title: t("wrongTitle"),
            lead: t.rich("wrongLead", {
              name,
              email: view.email,
              me: view.me.email,
              m: (c) => <span className="font-mono text-fg">{c}</span>,
            }),
          }
        : view.refusal === "not_alone"
          ? { title: t("notAloneTitle"), lead: t("notAloneLead", { space }) }
          : { title: t("fullTitle", { space }), lead: t("fullLead", { name }) };
    return (
      <Frame {...frame} tone="warm">
        <Head title={stop.title} lead={stop.lead} />
        <Bottom>
          {view.refusal === "wrong_account" ? (
            <button
              type="button"
              className={cta}
              onClick={async () => {
                clearActiveTimersForSignOut();
                await signOut({ redirectTo: `/login?invite=${encodeURIComponent(view.token)}` });
              }}
            >
              {t("switchAccount")}
            </button>
          ) : view.refusal === "not_alone" ? (
            <Link href="/settings" className={cta}>
              {t("goSettings")}
            </Link>
          ) : (
            <Link href="/today" className={cta}>
              {t("goToday")}
            </Link>
          )}
        </Bottom>
      </Frame>
    );
  }

  // The plan line: where the person's trial goes, and what covers them next.
  const myTrialDays =
    view.me.access?.allowed && view.me.access.source === "trial"
      ? (view.me.access.trialDaysLeft ?? 0)
      : null;
  const theirs = view.theirs;
  const planBody = !theirs
    ? null
    : theirs.allowed && theirs.source === "trial" && theirs.until
      ? myTrialDays !== null
        ? t("planFromTrialToTrial", { n: myTrialDays, space, date: short(theirs.until) })
        : t("planToTrial", { space, date: short(theirs.until) })
      : theirs.allowed
        ? myTrialDays !== null
          ? t("planFromTrialToCovered", { n: myTrialDays, space })
          : t("planToCovered", { space })
        : t("planToLocked", { space, name: view.payerName });
  const moves = [
    {
      title: t("moveTasks", { n: view.me.taskCount }),
      body: t("moveTasksBody", { name }),
      icon: LOCK,
      dot: "bg-fit text-on-primary",
    },
    { title: t("moveRest"), body: t("moveRestBody"), icon: CHECK, dot: "bg-fit text-on-primary" },
    ...(planBody
      ? [
          {
            title: myTrialDays !== null ? t("movePlanTrial") : t("movePlanOther", { space }),
            body: planBody,
            icon: SWAP,
            dot: "bg-surface-2 text-fg",
          },
        ]
      : []),
  ];

  return (
    <Frame {...frame}>
      <Head title={t("title", { name })} lead={t("lead", { space })} />
      <section
        aria-labelledby="moves-h"
        className="mt-[18px] animate-up rounded-[28px] bg-surface-2 p-2 [animation-delay:220ms]"
      >
        <h2 id="moves-h" className="px-2.5 py-2 font-sans text-xs font-semibold text-muted">
          {t("movesTitle")}
        </h2>
        <div className="rounded-[22px] bg-surface px-3.5 py-1">
          {moves.map((m, i) => (
            <div
              key={m.title}
              className={cn("flex gap-3 py-3", i > 0 && "border-t border-surface-2")}
            >
              <span
                aria-hidden
                className={cn(
                  "mt-px flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full",
                  m.dot,
                )}
              >
                <Glyph d={m.icon} />
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm leading-[19px] font-semibold">{m.title}</span>
                <span className="text-2xs leading-[17px] text-muted">{m.body}</span>
              </span>
            </div>
          ))}
        </div>
      </section>
      {failed && (
        <p role="alert" className="mt-3 text-xs text-danger">
          {t("failed")}
        </p>
      )}
      <Bottom>
        <button type="button" onClick={join} disabled={busy} className={cn(cta, "cursor-pointer")}>
          {busy ? "…" : t("join", { space })}
        </button>
        <button
          type="button"
          onClick={() => setAfter("declined")}
          className="h-11 cursor-pointer rounded-pill text-sm font-semibold text-muted"
        >
          {t("notNow")}
        </button>
      </Bottom>
    </Frame>
  );
}

/** The page for someone signed out: which Google account the invite is for,
 *  and back to the link once they are in. */
export function InviteNew({
  token,
  email,
  expiresAt,
  space,
  inviter,
  covered,
}: {
  token: string;
  email: string;
  expiresAt: string;
  space: string;
  inviter: HouseholdMember;
  /** Whether the space has access to share (a live trial, a plan, a comp). */
  covered: boolean;
}) {
  const t = useTranslations("invite");
  const ta = useTranslations("auth");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const name = inviter.display_name;
  const perks = [...(covered ? [t("perkFree", { space })] : []), t("perkPrivate"), t("perkDay")];

  async function go() {
    setError(false);
    setLoading(true);
    try {
      // Back to the link after Google: a brand-new account has joined by then
      // (the invite is claimed at sign-up), an existing one gets to choose.
      await signIn("google", { redirectTo: invitePath(token) });
    } catch {
      setError(true);
      setLoading(false);
    }
  }

  return (
    <Frame expires={expiresAt} inviter={inviter} me={null}>
      <Head title={t("titleNew", { name })} lead={t("leadNew", { name, space })} />
      <section className="mt-[18px] flex animate-up flex-col gap-2 rounded-[22px] bg-surface/75 px-4 py-3.5 [animation-delay:220ms]">
        <span className="text-xs font-semibold">{t("newAccount")}</span>
        <span className="self-start rounded-pill bg-surface px-3 py-1.5 font-mono text-xs shadow-[inset_0_0_0_1.5px_var(--color-fit-from)]">
          {email}
        </span>
        <span className="text-2xs leading-[17px] text-muted">{t("newAccountNote", { name })}</span>
      </section>
      <ul className="mt-3 flex animate-up flex-col gap-2 [animation-delay:300ms]">
        {perks.map((p) => (
          <li key={p} className="flex items-center gap-2.5 text-sm font-medium">
            <span
              aria-hidden
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-fit text-on-primary"
            >
              <Glyph d={CHECK} size={10} width={2.6} />
            </span>
            {p}
          </li>
        ))}
      </ul>
      <Bottom>
        <button type="button" onClick={go} disabled={loading} className={cn(cta, "cursor-pointer")}>
          {loading ? ta("connecting") : t("continueGoogle")}
          <Glyph d={ARROW} size={15} width={1.8} />
        </button>
        {error && (
          <p role="alert" className="text-center text-sm text-danger">
            {ta("signInFailed")}
          </p>
        )}
      </Bottom>
    </Frame>
  );
}

/** A link that no longer works. */
export function InviteInvalid() {
  const t = useTranslations("invite");
  return (
    <main className="flex min-h-dvh justify-center bg-linear-to-b from-wash-peach via-surface via-50% to-surface pt-safe pb-safe text-fg">
      <div className="flex min-h-dvh w-full max-w-[430px] flex-col px-5 pt-[26px] pb-7">
        <span className="font-display text-[17px] font-semibold tracking-[-0.01em]">
          Morchitask
        </span>
        <Head title={t("invalidTitle")} lead={t("invalidLead")} />
        <Bottom>
          <Link href="/today" className={cta}>
            {t("goToday")}
          </Link>
        </Bottom>
      </div>
    </main>
  );
}
