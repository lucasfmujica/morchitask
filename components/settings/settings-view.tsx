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
import { useHousehold, useUpdateHouseholdName } from "@/lib/queries/households";
import { OwnerAvatar } from "@/components/tasks/owner-avatar";
import { ThemeSelector } from "./theme-selector";
import { ChannelsManager } from "./channels-manager";
import { InviteCard } from "./invite-card";
import { NotificationsCard } from "./notifications-card";
import { LanguageSelector } from "./language-selector";
import { DangerZone } from "./danger-zone";
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

  const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5 MB
  const MAX_AVATAR_LABEL = "5 MB";

  function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be re-picked later
    if (!file) return;
    setAvatarError(null);
    if (!file.type.startsWith("image/")) {
      setAvatarError(t("avatarNotImage"));
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarError(t("avatarTooBig", { max: MAX_AVATAR_LABEL }));
      return;
    }
    uploadAvatar.mutate(file, {
      onError: () => setAvatarError(t("avatarFailed")),
    });
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

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-extrabold tracking-tight text-fg">{t("title")}</h1>

      {/* Profile */}
      <Section title={t("profile")}>
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
            <OwnerAvatar profile={me ?? undefined} size={44} />
            <span className="absolute -right-0.5 -bottom-0.5 flex h-5 w-5 items-center justify-center rounded-full border border-surface bg-primary text-on-primary shadow-soft">
              <Camera className="h-3 w-3" aria-hidden />
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
            accept="image/*"
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
            className="h-10 flex-1 rounded-lg border border-border bg-surface px-3 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-focus"
          />
        </div>
        <div className="flex items-center gap-3 pl-[56px]">
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
      </Section>

      {/* Shared space */}
      <Section title={t("space")}>
        <input
          key={household?.id}
          defaultValue={household?.name ?? ""}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== household?.name) updateHouseholdName.mutate(v);
          }}
          placeholder={t("spaceName")}
          aria-label={t("spaceName")}
          className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-focus"
        />
        <p className="text-xs text-muted">{t("spaceHint")}</p>
      </Section>

      {/* Theme */}
      <Section title={t("appearance")}>
        <ThemeSelector />
      </Section>

      {/* Language */}
      <Section title={t("language")}>
        <LanguageSelector />
        <p className="text-xs text-muted">{t("languageHint")}</p>
      </Section>

      {/* Channels */}
      <Section title={t("categories")}>
        <ChannelsManager />
      </Section>

      {/* Integrations */}
      <Section title={t("integrations")}>
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <CalendarClock className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-fg">Google Calendar</p>
              <p className="text-xs text-muted">{t("calendarPitch")}</p>
            </div>
          </div>
          {connected ? (
            <div className="flex flex-wrap items-center gap-2 pl-12 sm:shrink-0 sm:pl-0">
              <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary">
                <Check className="h-3 w-3" aria-hidden /> {t("connected")}
              </span>
              <button
                onClick={connectCalendar}
                className="cursor-pointer rounded-lg px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg"
                title={t("reconnectHint")}
              >
                {t("reconnect")}
              </button>
              <button
                onClick={disconnectCalendar}
                className="cursor-pointer rounded-lg px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-danger"
              >
                {t("disconnect")}
              </button>
            </div>
          ) : (
            <button
              onClick={connectCalendar}
              className="ml-12 w-fit cursor-pointer rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover sm:ml-0 sm:shrink-0"
            >
              {t("connect")}
            </button>
          )}
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <Music className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-fg">Spotify</p>
              <p className="text-xs text-muted">{t("spotifyPitch")}</p>
            </div>
          </div>
          {spotifyConnected ? (
            <div className="flex flex-wrap items-center gap-2 pl-12 sm:shrink-0 sm:pl-0">
              <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary">
                <Check className="h-3 w-3" aria-hidden /> {t("connected")}
              </span>
              <button
                onClick={() =>
                  disconnectSpotify.mutate(undefined, { onSuccess: clearSpotifyTokenCache })
                }
                className="cursor-pointer rounded-lg px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-danger"
              >
                {t("disconnect")}
              </button>
            </div>
          ) : (
            <button
              onClick={connectSpotify}
              className="ml-12 w-fit cursor-pointer rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover sm:ml-0 sm:shrink-0"
            >
              {t("connect")}
            </button>
          )}
        </div>
      </Section>

      {/* Sharing */}
      <Section title={t("space")}>
        <InviteCard />
      </Section>

      {/* Notifications */}
      <Section title={t("notifications")}>
        <NotificationsCard />
      </Section>

      {/* Data rights. Last, because it is where you leave — and visible,
          because the privacy policy says it is here. */}
      <Section title={t("yourData")}>
        <DangerZone />
      </Section>

      <button
        onClick={handleSignOut}
        className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-danger transition-colors hover:bg-danger/10"
      >
        <LogOut className="h-4 w-4" aria-hidden />
        {tcm("signOut")}
      </button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-subtle">{title}</h2>
      {children}
    </section>
  );
}
