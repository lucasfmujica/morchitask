"use client";

import { CalendarClock, Check, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { profileKeys, useMe, useUpdateMyProfile } from "@/lib/queries/profiles";
import { createClient } from "@/lib/supabase/client";
import { OwnerAvatar } from "@/components/tasks/owner-avatar";
import { ThemeSelector } from "./theme-selector";
import { ChannelsManager } from "./channels-manager";
import { NotificationsCard } from "./notifications-card";

export function SettingsView() {
  const router = useRouter();
  const qc = useQueryClient();
  const me = useMe().data;
  const updateProfile = useUpdateMyProfile();
  const connected = me?.google_calendar_connected ?? false;

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  async function connectCalendar() {
    await createClient().auth.signInWithOAuth({
      provider: "google",
      options: {
        // readonly = ver todos tus calendarios; events = crear/editar (2 vías).
        scopes:
          "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events",
        queryParams: { access_type: "offline", prompt: "consent" },
        redirectTo: `${window.location.origin}/auth/callback?next=/settings`,
      },
    });
  }

  async function disconnectCalendar() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("google_credentials").delete().eq("owner_id", user.id);
    await supabase.from("profiles").update({ google_calendar_connected: false }).eq("id", user.id);
    qc.invalidateQueries({ queryKey: profileKeys.me });
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-extrabold tracking-tight text-fg">Ajustes</h1>

      {/* Profile */}
      <Section title="Tu perfil">
        <div className="flex items-center gap-3">
          <OwnerAvatar profile={me ?? undefined} size={44} />
          <input
            key={me?.id}
            defaultValue={me?.display_name ?? ""}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== me?.display_name) updateProfile.mutate({ display_name: v });
            }}
            placeholder="Tu nombre"
            aria-label="Tu nombre"
            className="h-10 flex-1 rounded-lg border border-border bg-surface px-3 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-focus"
          />
        </div>
      </Section>

      {/* Theme */}
      <Section title="Apariencia">
        <ThemeSelector />
      </Section>

      {/* Channels */}
      <Section title="Categorías">
        <ChannelsManager />
      </Section>

      {/* Integrations */}
      <Section title="Integraciones">
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <CalendarClock className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-fg">Google Calendar</p>
              <p className="text-xs text-muted">
                Ver tus eventos y mandar tus bloques de tarea al calendario (2 vías).
              </p>
            </div>
          </div>
          {connected ? (
            <div className="flex flex-wrap items-center gap-2 pl-12 sm:shrink-0 sm:pl-0">
              <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary">
                <Check className="h-3 w-3" aria-hidden /> Conectado
              </span>
              <button
                onClick={connectCalendar}
                className="cursor-pointer rounded-lg px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg"
                title="Volvé a conectar para activar la sincronización en dos vías"
              >
                Reconectar
              </button>
              <button
                onClick={disconnectCalendar}
                className="cursor-pointer rounded-lg px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-danger"
              >
                Desconectar
              </button>
            </div>
          ) : (
            <button
              onClick={connectCalendar}
              className="ml-12 w-fit cursor-pointer rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover sm:ml-0 sm:shrink-0"
            >
              Conectar
            </button>
          )}
        </div>
      </Section>

      {/* Notifications */}
      <Section title="Notificaciones">
        <NotificationsCard />
      </Section>

      <button
        onClick={signOut}
        className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-danger transition-colors hover:bg-danger/10"
      >
        <LogOut className="h-4 w-4" aria-hidden />
        Cerrar sesión
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
