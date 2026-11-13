"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, LogOut } from "lucide-react";
import { signIn, signOut } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { disconnectCalendar as disconnectCalendarAction } from "@/lib/actions/google";
import {
  CALENDAR_AUTHORIZATION_PARAMS,
  CALENDAR_CONNECT_RETURN_PARAM,
  calendarConnectOutcome,
  calendarConnectReturnTo,
} from "@/lib/google-grant";
import { profileKeys, useMe, useUpdateMyProfile, useUploadMyAvatar } from "@/lib/queries/profiles";
import {
  clearSpotifyTokenCache,
  connectSpotify,
  useDisconnectSpotify,
  useSpotifyConnected,
} from "@/lib/queries/spotify";
import { AVATAR_CONTENT_TYPES, avatarRejectionReason } from "@/lib/avatars";
import { useHousehold, useUpdateHouseholdName } from "@/lib/queries/households";
import { OwnerAvatar } from "@/components/tasks/owner-avatar";
import { cn } from "@/lib/utils";
import { ThemeSelector } from "./theme-selector";
import { ChannelsManager } from "./channels-manager";
import { InviteCard } from "./invite-card";
import { NotificationsCard } from "./notifications-card";
import { InboundEmailCard } from "./inbound-email-card";
import { StintCard } from "./stint-card";
import { LanguageSelector } from "./language-selector";
import { DangerZone } from "./danger-zone";

export function SettingsView() {
  const t = useTranslations("settings");
  const tcm = useTranslations("common");
  const qc = useQueryClient();
  const me = useMe().data;
  const updateProfile = useUpdateMyProfile();
  const uploadAvatar = useUploadMyAvatar();
  const household = useHousehold().data;
  const updateHouseholdName = useUpdateHouseholdName();
  const fileInput = useRef<HTMLInputElement>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const connected = me?.google_calendar_connected ?? false;
  // Back from Google: a connect that returned without Calendar access looks
  // like a plain login to the server, which rightly changes nothing. The return
  // URL is the one place that knows they meant to connect, so the message comes
  // from here. Gated on the profile being loaded, or "still loading" would read
  // as "not connected". The marker stays in the URL; it only ever shows while
  // the calendar is still not connected, which is exactly when it is true.
  const connectReturn = useSearchParams().get(CALENDAR_CONNECT_RETURN_PARAM);
  const calendarDeclined =
    !!me && calendarConnectOutcome(connectReturn, me.google_calendar_connected) === "declined";
  const spotifyConnected = useSpotifyConnected();
  const disconnectSpotify = useDisconnectSpotify();

  function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be re-picked later
    if (!file || !me) return;
    setAvatarError(null);
    const reason = avatarRejectionReason(file);
    if (reason) {
      setAvatarError(
        reason === "notImage"
          ? t("avatarNotImage")
          : reason === "tooBig"
            ? t("avatarTooBig", { max: "5 MB" })
            : t("avatarEmpty"),
      );
      return;
    }
    uploadAvatar.mutate(
      { file, userId: me.id },
      { onError: () => setAvatarError(t("avatarFailed")) },
    );
  }

  async function handleSignOut() {
    await signOut({ redirectTo: "/login" });
  }

  /** Calendar is its own grant, asked for only here: sign-in requests identity
   * scopes alone (see lib/google-grant.ts). The third argument overrides the
   * provider's default params for this one trip to Google. */
  async function connectCalendar() {
    await signIn(
      "google",
      { redirectTo: calendarConnectReturnTo(window.location.pathname) },
      CALENDAR_AUTHORIZATION_PARAMS,
    );
  }

  async function disconnectCalendar() {
    await disconnectCalendarAction();
    qc.invalidateQueries({ queryKey: profileKeys.me });
  }

  // A field on the white card sits on the page colour, one step back from the
  // card, so it reads as a slot to type into rather than another card.
  const field =
    "h-11 w-full rounded-[14px] bg-bg px-3.5 text-sm text-fg placeholder:text-subtle outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-focus";
  const fieldLabel = "flex flex-col gap-1.5 text-2xs font-semibold text-muted";

  return (
    <div className="flex flex-col gap-4">
      <h1 className="animate-up px-2 pt-3 font-display text-[32px] leading-9 font-bold tracking-[-0.02em] text-fg [animation-duration:600ms]">
        {t("title")}
      </h1>

      {/* Bento: as many 300px columns as fit, so it is three on a desktop,
          two on a tablet and one on the phone. The DOM order is the reading
          order on the phone, which is why the stacked pairs are grouped. */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] items-start gap-4">
        {/* Profile and the space's name: who you are and where you are. */}
        <Well delay={40}>
          <Card>
            <CardTitle>{t("profile")}</CardTitle>
            <div className="flex items-center gap-3.5">
              <OwnerAvatar profile={me ?? undefined} size={56} />
              <div className="flex min-w-0 flex-col items-start gap-1">
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  disabled={uploadAvatar.isPending}
                  className="h-9 cursor-pointer rounded-pill bg-surface-2 px-3.5 text-2xs font-semibold text-fg transition-colors hover:bg-border disabled:opacity-60"
                >
                  {uploadAvatar.isPending ? "…" : t("changePhoto")}
                </button>
                {me?.avatar_url && (
                  <button
                    type="button"
                    onClick={() => updateProfile.mutate({ avatar_url: null })}
                    className="cursor-pointer px-1 text-2xs font-medium text-muted transition-colors hover:text-danger"
                  >
                    {t("removePhoto")}
                  </button>
                )}
              </div>
              <input
                ref={fileInput}
                type="file"
                accept={AVATAR_CONTENT_TYPES.join(",")}
                onChange={onPickAvatar}
                className="hidden"
              />
            </div>
            {avatarError && <p className="text-2xs text-danger">{avatarError}</p>}
            <label className={fieldLabel}>
              {t("yourName")}
              <input
                key={me?.id}
                defaultValue={me?.display_name ?? ""}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== me?.display_name) updateProfile.mutate({ display_name: v });
                }}
                placeholder={t("yourName")}
                className={field}
              />
            </label>
            <label className={fieldLabel}>
              {t("spaceName")}
              <input
                key={household?.id}
                defaultValue={household?.name ?? ""}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== household?.name) updateHouseholdName.mutate(v);
                }}
                placeholder={t("spaceName")}
                className={field}
              />
            </label>
            <p className="text-2xs leading-[17px] text-muted">{t("spaceHint")}</p>
          </Card>
        </Well>

        {/* Two short preferences stacked, then who else is in the space. */}
        <div className="flex flex-col gap-4">
          <FlatWell title={t("appearance")} delay={80}>
            <ThemeSelector />
          </FlatWell>
          <FlatWell title={t("language")} hint={t("languageHint")} delay={120}>
            <LanguageSelector />
          </FlatWell>
          <Well delay={140}>
            <InviteCard />
          </Well>
        </div>

        <Well delay={160}>
          <NotificationsCard />
        </Well>

        <Well title={t("categories")} delay={200}>
          <ChannelsManager />
        </Well>

        <Well title={t("integrations")} delay={240}>
          <Integration
            name="Google Calendar"
            pitch={t("calendarPitch")}
            connected={connected}
            onConnect={connectCalendar}
            onDisconnect={disconnectCalendar}
            onReconnect={connectCalendar}
            notice={calendarDeclined ? t("calendarDeclined") : null}
          />
          <Integration
            name="Spotify"
            pitch={t("spotifyPitch")}
            connected={spotifyConnected}
            onConnect={connectSpotify}
            onDisconnect={() =>
              disconnectSpotify.mutate(undefined, { onSuccess: clearSpotifyTokenCache })
            }
          />
          {/* Renders nothing until capture by email is configured on the server. */}
          <InboundEmailCard />
          <StintCard />
        </Well>

        <div
          className="flex animate-up flex-col gap-4 [animation-duration:600ms]"
          style={{ animationDelay: "280ms" }}
        >
          {/* Plan and billing live on their own page; this is the way in. Not
              a card with the price on it: that number belongs in one place,
              and duplicating it here is how the two drift apart. */}
          <Link
            href="/billing"
            className="group flex items-center gap-3 rounded-[28px] bg-fg p-5 text-surface transition-opacity hover:opacity-90"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="font-display text-base font-semibold">{t("billingTitle")}</span>
              <span className="text-2xs text-surface/80">{t("billingDesc")}</span>
            </div>
            <ArrowRight
              className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5"
              strokeWidth={1.8}
              aria-hidden
            />
          </Link>

          {/* Signing out lives here since the sidebar dropped it: next to the
              plan and the way out for good, where people look for "leave". */}
          <button
            onClick={handleSignOut}
            className="flex h-14 cursor-pointer items-center gap-3 rounded-[28px] bg-surface-2 px-5 text-sm font-semibold text-fg transition-colors hover:bg-border"
          >
            <LogOut className="h-4 w-4 text-muted" aria-hidden />
            {tcm("signOut")}
          </button>

          {/* Data rights. Last, because it is where you leave, and visible,
              because the privacy policy says it is here. */}
          <DangerZone />
        </div>
      </div>
    </div>
  );
}

/** One integration as a white card: a status dot, the name, its one action,
 *  and what connecting it gets you underneath. */
function Integration({
  name,
  pitch,
  connected,
  onConnect,
  onDisconnect,
  onReconnect,
  notice,
}: {
  name: string;
  pitch: string;
  connected: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onReconnect?: () => void;
  /** Why the last attempt to connect did not take, when it did not. */
  notice?: string | null;
}) {
  const t = useTranslations("settings");
  const pill =
    "h-[34px] shrink-0 cursor-pointer rounded-pill px-3.5 text-2xs font-semibold transition-colors duration-200";
  return (
    <Card className="gap-2.5 rounded-[18px] p-3.5">
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            "h-2.5 w-2.5 shrink-0 rounded-full transition-colors duration-300",
            // The canvas's "connected" green (#3FA266) sits between the two
            // ends of the fit gradient; there is no token for it yet.
            connected
              ? "bg-[color-mix(in_srgb,var(--color-fit-from)_30%,var(--color-primary))]"
              : "bg-border-strong",
          )}
          aria-hidden
        />
        <p className="min-w-0 flex-1 text-sm font-semibold text-fg">
          {name}
          {/* The dot is colour only; this is the same fact for a screen reader. */}
          {connected && <span className="sr-only"> {t("connected")}</span>}
        </p>
        {connected ? (
          <button
            onClick={onDisconnect}
            className={cn(pill, "bg-surface-2 text-fg hover:bg-border")}
          >
            {t("disconnect")}
          </button>
        ) : (
          <button onClick={onConnect} className={cn(pill, "bg-fg text-surface hover:bg-fg/85")}>
            {t("connect")}
          </button>
        )}
      </div>
      <p className="text-2xs leading-[17px] text-muted">
        {pitch}
        {/* Quiet and after the pitch, not a third button in the row: it is
            the rare fix for a connection made before two-way sync existed. */}
        {connected && onReconnect && (
          <>
            {" "}
            <button
              onClick={onReconnect}
              title={t("reconnectHint")}
              className="cursor-pointer font-semibold text-fg underline decoration-border-strong underline-offset-2 transition-colors hover:decoration-fg"
            >
              {t("reconnect")}
            </button>
          </>
        )}
      </p>
      {notice && (
        <p role="status" className="text-2xs leading-[17px] text-danger">
          {notice}
        </p>
      )}
    </Card>
  );
}

/** A settings group: a well holding white cards, with its title (if it has
 *  one outside the card) set into the well itself. `delay` staggers the
 *  canvas's entrance, 40ms a section in reading order. */
function Well({
  title,
  className,
  delay = 0,
  children,
}: {
  title?: string;
  className?: string;
  delay?: number;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "flex animate-up flex-col gap-1.5 rounded-[28px] bg-surface-2 p-2 [animation-duration:600ms]",
        className,
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      {title && (
        <h2 className="px-2.5 pt-2.5 pb-1 font-display text-base font-semibold text-fg">{title}</h2>
      )}
      {children}
    </section>
  );
}

/** A well with no card in it: for a single control that is its own surface,
 *  like the segmented theme and language pickers. */
function FlatWell({
  title,
  hint,
  delay = 0,
  children,
}: {
  title: string;
  hint?: string;
  delay?: number;
  children: React.ReactNode;
}) {
  return (
    <section
      className="flex animate-up flex-col gap-3 rounded-[28px] bg-surface-2 p-[18px] [animation-duration:600ms]"
      style={{ animationDelay: `${delay}ms` }}
    >
      <h2 className="font-display text-base font-semibold text-fg">{title}</h2>
      {children}
      {hint && <p className="text-2xs text-muted">{hint}</p>}
    </section>
  );
}

/** The white card inside a well. Flat: the well around it is the depth. */
function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-3.5 rounded-[22px] bg-surface p-[18px]", className)}>
      {children}
    </div>
  );
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="font-display text-base font-semibold text-fg">{children}</h2>;
}
