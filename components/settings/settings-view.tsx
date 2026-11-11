"use client";

import { useRef, useState } from "react";
import { CalendarClock, Camera, Check, LogOut, Music } from "lucide-react";
import { signIn, signOut } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { disconnectCalendar as disconnectCalendarAction } from "@/lib/actions/google";
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
import { ThemeSelector } from "./theme-selector";
import { ChannelsManager } from "./channels-manager";
import { InviteCard } from "./invite-card";
import { NotificationsCard } from "./notifications-card";
import { InboundEmailCard } from "./inbound-email-card";
import { LanguageSelector } from "./language-selector";
import { DangerZone } from "./danger-zone";
import Link from "next/link";
import { ArrowRight, CreditCard } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

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

  /** Re-consent to Google — the provider already requests Calendar scopes on
   * every sign-in (see lib/auth.ts), so this just re-runs that same flow. */
  async function connectCalendar() {
    await signIn("google", { redirectTo: "/settings" });
  }

  async function disconnectCalendar() {
    await disconnectCalendarAction();
    qc.invalidateQueries({ queryKey: profileKeys.me });
  }

  // Shared shapes: a pill field on the white card, the "connected" chip and the
  // quiet text actions beside it.
  const field =
    "h-11 w-full rounded-pill bg-surface-2 px-4 text-sm text-fg placeholder:text-subtle outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-focus";
  const connectedChip =
    "inline-flex h-7 items-center gap-1 rounded-pill bg-primary-soft px-2.5 text-xs font-semibold text-primary";
  const quietAction =
    "h-7 cursor-pointer rounded-pill px-2.5 text-xs font-semibold text-muted transition-colors hover:bg-surface-2";

  return (
    <div className="flex max-w-5xl flex-col gap-4">
      <h1 className="px-1 pt-1 text-2xl font-bold tracking-tight text-fg sm:text-3xl">
        {t("title")}
      </h1>

      {/* Bento: two columns of wells on desktop, one on the phone. The DOM
          order is the reading order, so the pairs fall out of it. */}
      <div className="grid items-start gap-4 md:grid-cols-2">
        {/* Profile */}
        <Section title={t("profile")}>
          <Card>
            <div className="flex items-center gap-3">
              {/* Avatar with a camera badge to upload a photo */}
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={uploadAvatar.isPending}
                aria-label={t("changePhoto")}
                title={t("changePhoto")}
                className="group relative shrink-0 cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-60"
              >
                <OwnerAvatar profile={me ?? undefined} size={48} />
                <span className="absolute -right-0.5 -bottom-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-surface bg-fg text-bg">
                  <Camera className="h-2.5 w-2.5" aria-hidden />
                </span>
                {uploadAvatar.isPending && (
                  <span className="absolute inset-0 flex items-center justify-center rounded-full bg-scrim text-2xs font-semibold text-on-scrim">
                    …
                  </span>
                )}
              </button>
              <input
                ref={fileInput}
                type="file"
                accept={AVATAR_CONTENT_TYPES.join(",")}
                onChange={onPickAvatar}
                className="hidden"
              />
              <input
                key={me?.id}
                defaultValue={me?.display_name ?? ""}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== me?.display_name) updateProfile.mutate({ display_name: v });
                }}
                placeholder={t("yourName")}
                aria-label={t("yourName")}
                className={cn(field, "flex-1")}
              />
            </div>
            {(me?.avatar_url || avatarError) && (
              <div className="flex items-center gap-3 pl-[60px]">
                {me?.avatar_url && (
                  <button
                    type="button"
                    onClick={() => updateProfile.mutate({ avatar_url: null })}
                    className="cursor-pointer text-xs font-medium text-muted transition-colors hover:text-danger"
                  >
                    {t("removePhoto")}
                  </button>
                )}
                {avatarError && <span className="text-xs text-danger">{avatarError}</span>}
              </div>
            )}
          </Card>
        </Section>

        {/* Shared space */}
        <Section title={t("space")} hint={t("spaceHint")}>
          <Card>
            <input
              key={household?.id}
              defaultValue={household?.name ?? ""}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== household?.name) updateHouseholdName.mutate(v);
              }}
              placeholder={t("spaceName")}
              aria-label={t("spaceName")}
              className={field}
            />
          </Card>
        </Section>

        {/* Theme */}
        <Section title={t("appearance")}>
          <ThemeSelector />
        </Section>

        {/* Language */}
        <Section title={t("language")} hint={t("languageHint")}>
          <LanguageSelector />
        </Section>

        {/* Channels */}
        <Section title={t("categories")}>
          <ChannelsManager />
        </Section>

        {/* Integrations */}
        <Section title={t("integrations")}>
          <Card className="sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                <CalendarClock className="h-[18px] w-[18px]" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-fg">Google Calendar</p>
                <p className="text-xs text-muted">{t("calendarPitch")}</p>
              </div>
            </div>
            {connected ? (
              <div className="flex flex-wrap items-center gap-1 pl-12 sm:shrink-0 sm:pl-0">
                <span className={connectedChip}>
                  <Check className="h-3 w-3" aria-hidden /> {t("connected")}
                </span>
                <button
                  onClick={connectCalendar}
                  className={cn(quietAction, "hover:text-fg")}
                  title={t("reconnectHint")}
                >
                  {t("reconnect")}
                </button>
                <button
                  onClick={disconnectCalendar}
                  className={cn(quietAction, "hover:text-danger")}
                >
                  {t("disconnect")}
                </button>
              </div>
            ) : (
              <Button
                size="sm"
                onClick={connectCalendar}
                className="ml-12 w-fit sm:ml-0 sm:shrink-0"
              >
                {t("connect")}
              </Button>
            )}
          </Card>

          <Card className="sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                <Music className="h-[18px] w-[18px]" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-fg">Spotify</p>
                <p className="text-xs text-muted">{t("spotifyPitch")}</p>
              </div>
            </div>
            {spotifyConnected ? (
              <div className="flex flex-wrap items-center gap-1 pl-12 sm:shrink-0 sm:pl-0">
                <span className={connectedChip}>
                  <Check className="h-3 w-3" aria-hidden /> {t("connected")}
                </span>
                <button
                  onClick={() =>
                    disconnectSpotify.mutate(undefined, { onSuccess: clearSpotifyTokenCache })
                  }
                  className={cn(quietAction, "hover:text-danger")}
                >
                  {t("disconnect")}
                </button>
              </div>
            ) : (
              <Button
                size="sm"
                onClick={connectSpotify}
                className="ml-12 w-fit sm:ml-0 sm:shrink-0"
              >
                {t("connect")}
              </Button>
            )}
          </Card>
        </Section>

        {/* Sharing */}
        <Section title={t("space")}>
          <InviteCard />
        </Section>

        {/* Notifications */}
        <Section title={t("notifications")}>
          <NotificationsCard />
        </Section>

        {/* Renders nothing until capture by email is configured on the server. */}
        <InboundEmailCard />

        {/* Plan and billing live on their own page — this is the way in. Not a
            card with the price on it: that number belongs in one place, and
            duplicating it here is how the two drift apart. */}
        <Section title={t("billing")}>
          <Link
            href="/billing"
            className="group flex items-center gap-3 rounded-xl bg-fg p-4 text-bg transition-opacity hover:opacity-90"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg/15">
              <CreditCard className="h-[18px] w-[18px]" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-sm font-semibold">{t("billingTitle")}</p>
              <p className="text-xs text-bg/70">{t("billingDesc")}</p>
            </div>
            <ArrowRight
              className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
          </Link>
        </Section>

        {/* Data rights. Last, because it is where you leave — and visible,
            because the privacy policy says it is here. */}
        <Section title={t("yourData")} className="md:col-span-2">
          <DangerZone />
        </Section>
      </div>

      <button
        onClick={handleSignOut}
        className="inline-flex h-10 w-fit cursor-pointer items-center gap-2 rounded-pill bg-surface-2 px-4 text-sm font-semibold text-danger transition-colors hover:bg-danger/10"
      >
        <LogOut className="h-4 w-4" aria-hidden />
        {tcm("signOut")}
      </button>
    </div>
  );
}

/** A settings group: a well with its title inside and the controls as white
 *  cards. The hint sits under the cards, still inside the tray it explains. */
function Section({
  title,
  hint,
  className,
  children,
}: {
  title: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("flex flex-col gap-2 rounded-2xl bg-surface-2 p-2", className)}>
      <h2 className="px-3 pt-2 pb-0.5 text-base font-semibold text-fg">{title}</h2>
      {children}
      {hint && <p className="px-3 pb-1.5 text-xs text-muted">{hint}</p>}
    </section>
  );
}

/** The white card inside a well. */
function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-3 rounded-xl bg-surface p-3.5 shadow-soft", className)}>
      {children}
    </div>
  );
}
