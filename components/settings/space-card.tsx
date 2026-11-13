"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { firstName } from "@/lib/first-name";
import { getSeparationPreview, getSpace, leaveSpace, removeMember } from "@/lib/actions/households";
import { OwnerAvatar } from "@/components/tasks/owner-avatar";
import { cn } from "@/lib/utils";
import { InviteCard } from "./invite-card";

export const spaceKeys = { current: ["space"] as const };

type Space = Awaited<ReturnType<typeof getSpace>>;
type Member = Space["members"][number];

/**
 * The shared space: who is in it, who runs it, the way to invite someone, and
 * the two ways out (taking the other person out, or walking out yourself).
 *
 * Who may do which is decided on the server (`getSpace`, from lib/space-roles)
 * and checked again inside the move itself; the buttons only follow it.
 */
export function SpaceCard() {
  const t = useTranslations("space");
  const format = useFormatter();
  const { data: space } = useQuery({ queryKey: spaceKeys.current, queryFn: () => getSpace() });
  const [sheetFor, setSheetFor] = useState<Member | null>(null);

  const members = space?.members ?? [];
  const other = members.find((m) => m.id !== space?.meId) ?? null;
  const me = members.find((m) => m.id === space?.meId) ?? null;
  const long = (d: string) => format.dateTime(new Date(d), { day: "numeric", month: "long" });

  function subline(m: Member) {
    const mine = m.id === space?.meId;
    if (m.isCreator) {
      return space?.createdAt ? t("created", { date: long(space.createdAt) }) : null;
    }
    return m.joinedAt ? t(mine ? "joinedYou" : "joined", { date: long(m.joinedAt) }) : null;
  }

  return (
    <>
      <div className="flex items-baseline gap-2.5 px-3 pt-2.5 pb-1.5">
        <h2 className="mr-auto font-display text-lg font-semibold text-fg">
          {space?.name ? t("title", { name: space.name }) : t("titleNoName")}
        </h2>
        {space && (
          <span className="font-mono text-2xs text-muted">
            {t("count", { n: members.length, max: 2 })}
          </span>
        )}
      </div>

      {members.map((m, i) => {
        const mine = m.id === space?.meId;
        const action =
          !mine && space?.canRemove
            ? // First name only: the full name pushed the row into a
              // three-line squeeze in the narrow settings column.
              t("remove", { name: firstName(m.display_name) })
            : mine && space?.canLeave
              ? t("leave")
              : null;
        const sub = subline(m);
        return (
          <div
            key={m.id}
            className="flex animate-up items-center gap-3.5 rounded-[20px] bg-surface py-3.5 pr-3.5 pl-4 [animation-duration:600ms]"
            style={{ animationDelay: `${80 + i * 60}ms` }}
          >
            <OwnerAvatar profile={m} size={44} />
            <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="min-w-0 truncate text-[15px] font-semibold text-fg">
                  {mine ? t("you", { name: m.display_name }) : m.display_name}
                </span>
                {m.managesPlan && (
                  <span className="rounded-pill bg-mint-soft px-2 py-0.5 text-[11px] font-semibold text-on-wash">
                    {t("managesPlan")}
                  </span>
                )}
              </span>
              {sub && <span className="truncate text-2xs text-muted">{sub}</span>}
            </span>
            {action && (
              <button
                type="button"
                onClick={() => setSheetFor(m)}
                aria-label={
                  !mine && space?.canRemove ? t("remove", { name: m.display_name }) : undefined
                }
                className="h-9 shrink-0 whitespace-nowrap cursor-pointer rounded-pill bg-accent-soft px-3.5 text-2xs font-semibold text-accent transition-colors hover:bg-accent/20"
              >
                {action}
              </button>
            )}
          </div>
        );
      })}

      {space && !other && (
        <p className="px-3.5 pt-0.5 pb-1 text-2xs leading-[17px] text-muted">{t("soloNote")}</p>
      )}
      {space?.canRemove && other && (
        <p className="px-3.5 pt-0.5 pb-1 text-2xs leading-[17px] text-muted">
          {me?.managesPlan
            ? t("adminNoteManager", { name: other.display_name })
            : t("adminNoteCreator", { name: other.display_name })}
        </p>
      )}

      <InviteCard />

      {sheetFor && space && (
        <SeparationSheet space={space} target={sheetFor} onClose={() => setSheetFor(null)} />
      )}
    </>
  );
}

/** "Qué es de quién": the rule the leave and remove sheets apply, said before
 *  anyone needs it. */
export function OwnershipCard() {
  const t = useTranslations("space");
  const { data: space } = useQuery({ queryKey: spaceKeys.current, queryFn: () => getSpace() });
  const name = space?.name ?? "";
  const rows = [
    {
      title: t("whoPrivate"),
      body: t("whoPrivateBody"),
      tone: "bg-surface-2 text-fg",
      d: "M3.5 7.5h9v6.5h-9zM5.5 7.5V5a2.5 2.5 0 0 1 5 0v2.5",
    },
    {
      title: t("whoShared"),
      body: t("whoSharedBody", { name }),
      tone: "bg-mint-soft text-primary",
      d: "M5.5 7a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5M1.5 14a4 4 0 0 1 8 0M11 7a2 2 0 1 0 0-4M11.5 10a3.5 3.5 0 0 1 3 4",
    },
  ];
  return (
    <>
      <h2 className="font-display text-base font-semibold text-fg">{t("whoTitle")}</h2>
      {rows.map((r) => (
        <div key={r.title} className="flex gap-3 rounded-[18px] bg-surface p-3.5">
          <span
            aria-hidden
            className={cn(
              "flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full",
              r.tone,
            )}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d={r.d} />
            </svg>
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm font-semibold text-fg">{r.title}</span>
            <span className="text-2xs leading-[17px] text-muted">{r.body}</span>
          </span>
        </div>
      ))}
    </>
  );
}

function SeparationSheet({
  space,
  target,
  onClose,
}: {
  space: Space;
  target: Member;
  onClose: () => void;
}) {
  const t = useTranslations("space");
  const format = useFormatter();
  const leaving = target.id === space.meId;
  const other = space.members.find((m) => m.id !== space.meId);
  const spaceName = space.name ?? "";
  const { data: preview } = useQuery({
    queryKey: ["space", "separation", target.id],
    queryFn: () => getSeparationPreview(target.id),
  });
  const [state, setState] = useState<"idle" | "busy" | "failed" | "refused">("idle");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function confirm() {
    setState("busy");
    try {
      const res = leaving ? await leaveSpace() : await removeMember(target.id);
      if (!res.ok) {
        setState("refused");
        return;
      }
      // A full load, not a cache refresh: the space under every query on the
      // page just changed, and nothing cached from before belongs in it.
      window.location.href = leaving ? "/today" : "/settings";
    } catch {
      setState("failed");
    }
  }

  const c = preview?.counts;
  const name = leaving ? (other?.display_name ?? "") : target.display_name;
  const taskRows = c
    ? [
        {
          n: c.privateTasks,
          title: t(leaving ? "leavePrivate" : "removePrivate", { n: c.privateTasks, name }),
          body: t(leaving ? "leavePrivateBody" : "removePrivateBody", { name }),
          tone: "text-fg",
        },
        {
          n: c.sharedTasks,
          title: t(leaving ? "leaveShared" : "removeShared", {
            n: c.sharedTasks,
            name,
            space: spaceName,
          }),
          body: t(leaving ? "leaveSharedBody" : "removeSharedBody", {
            dated: c.sharedDated,
            name,
          }),
          tone: "text-primary",
        },
        {
          n: c.comments,
          title: t(leaving ? "leaveComments" : "removeComments", { n: c.comments }),
          body: t(leaving ? "leaveCommentsBody" : "removeCommentsBody", { name }),
          tone: "text-muted",
        },
      ]
    : [];

  const ctaLabel = leaving ? t("leaveCta") : t("removeCta", { name });
  const access = preview?.access;
  const planRows: string[] = [];
  if (preview?.billingEnabled && access) {
    const until = access.until
      ? format.dateTime(new Date(access.until), { day: "numeric", month: "long" })
      : "";
    if (access.source === "subscription") {
      if (!leaving) planRows.push(t("planSamePrice"));
      planRows.push(
        leaving ? t("planLeaveCovered", { space: spaceName }) : t("planRemoveCovered", { name }),
      );
    } else if (access.source === "comp") {
      planRows.push(leaving ? t("planLeaveComp") : t("planRemoveComp", { name }));
    } else if (access.source === "trial" && access.allowed) {
      planRows.push(
        leaving
          ? t("planLeaveTrial", { date: until })
          : t("planRemoveTrial", { name, date: until }),
      );
    } else {
      planRows.push(leaving ? t("planLeaveNone") : t("planRemoveNone", { name }));
    }
  }

  // Portalled: the card sits inside an animated well, and a transformed
  // ancestor turns `fixed` into "fixed to that well".
  return createPortal(
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label={t("close")}
        onClick={onClose}
        className="absolute inset-0 h-full w-full animate-[mt-fade_.25s_ease_both] cursor-default bg-scrim"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="separation-h"
        className="absolute top-4 right-4 bottom-4 flex w-[min(460px,calc(100%-2rem))] animate-[mt-sheet_.35s_cubic-bezier(.2,.8,.2,1)_both] flex-col gap-4 overflow-y-auto rounded-[28px] bg-bg px-[22px] pt-6 pb-5 shadow-[0_24px_60px_rgb(var(--shadow-color)/0.25)]"
      >
        <div className="flex items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <h2
              id="separation-h"
              className="font-display text-[26px] leading-[30px] font-bold tracking-[-0.02em] text-fg"
            >
              {leaving
                ? t("leaveTitle", { space: spaceName })
                : t("removeTitle", { name, space: spaceName })}
            </h2>
            <p className="text-sm leading-5 text-muted">
              {leaving ? t("leaveLead", { name, space: spaceName }) : t("removeLead", { name })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-surface-2 text-fg transition-colors hover:bg-border"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <section className="flex flex-col gap-1.5 rounded-[24px] bg-surface-2 p-2">
          <h3 className="px-2.5 pt-1.5 pb-0.5 text-xs font-semibold text-muted">
            {t("tasksTitle")}
          </h3>
          {taskRows.map((r) => (
            <div key={r.title} className="flex gap-3 rounded-[18px] bg-surface px-3.5 py-3">
              <span
                className={cn(
                  "min-w-[30px] font-display text-[22px] leading-6 font-bold tabular-nums",
                  r.tone,
                )}
              >
                {r.n}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm leading-[19px] font-semibold text-fg">{r.title}</span>
                <span className="text-2xs leading-[17px] text-muted">{r.body}</span>
              </span>
            </div>
          ))}
        </section>

        {planRows.length > 0 && (
          <section className="flex flex-col gap-2 px-1.5">
            <h3 className="text-xs font-semibold text-muted">{t("planTitle")}</h3>
            {planRows.map((p) => (
              <span key={p} className="flex gap-2.5 text-xs leading-[19px] text-fg">
                <span
                  aria-hidden
                  className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-subtle"
                />
                {p}
              </span>
            ))}
          </section>
        )}

        <div className="mt-auto flex flex-col gap-2.5">
          <p className="text-2xs leading-[17px] text-muted">
            {leaving ? t("leaveFoot", { name }) : t("removeFoot", { name })}
          </p>
          {(state === "failed" || state === "refused") && (
            <p role="alert" className="text-2xs text-danger">
              {state === "refused" ? t("refused") : t("failed")}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-[46px] cursor-pointer rounded-pill bg-surface-2 px-5 text-sm font-semibold text-fg transition-colors hover:bg-border"
            >
              {t("cancel")}
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={!preview || state === "busy"}
              className="h-[46px] cursor-pointer rounded-pill bg-accent px-[22px] text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {state === "busy" ? "…" : ctaLabel}
            </button>
          </div>
        </div>
      </aside>
    </div>,
    document.body,
  );
}
