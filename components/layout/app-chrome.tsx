"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  Inbox,
  Plus,
  Repeat,
  Settings,
  Timer,
} from "lucide-react";
import { CHANNEL_COLORS, useChannels, useCreateChannel } from "@/lib/queries/channels";
import { useMe } from "@/lib/queries/profiles";
import { cn } from "@/lib/utils";
import { OwnerAvatar } from "@/components/tasks/owner-avatar";
import { TaskDetailSheet } from "@/components/tasks/task-detail-sheet";
import { SignOutButton } from "./sign-out-button";

type NavItem = {
  href: string;
  label: string;
  icon: typeof CalendarCheck;
  match: (p: string) => boolean;
  bottom?: boolean; // appears in the mobile bottom bar
};

// Grouped like Sunsama: planning views, then tools.
const PLAN_NAV: NavItem[] = [
  {
    href: "/today",
    label: "Hoy",
    icon: CalendarCheck,
    match: (p) => p === "/today" || p.startsWith("/day"),
    bottom: true,
  },
  {
    href: "/week",
    label: "Semana",
    icon: CalendarRange,
    match: (p) => p.startsWith("/week"),
    bottom: true,
  },
  {
    href: "/month",
    label: "Mes",
    icon: CalendarDays,
    match: (p) => p.startsWith("/month"),
    bottom: true,
  },
];
const TOOL_NAV: NavItem[] = [
  { href: "/focus", label: "Foco", icon: Timer, match: (p) => p.startsWith("/focus") },
  {
    href: "/backlog",
    label: "Backlog",
    icon: Inbox,
    match: (p) => p.startsWith("/backlog"),
    bottom: true,
  },
  {
    href: "/routines",
    label: "Rutinas",
    icon: Repeat,
    match: (p) => p.startsWith("/routines"),
    bottom: true,
  },
  { href: "/resumen", label: "Resumen", icon: BarChart3, match: (p) => p.startsWith("/resumen") },
];
const BOTTOM_NAV = [...PLAN_NAV, ...TOOL_NAV].filter((n) => n.bottom);

export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-dvh">
      <DesktopSidebar pathname={pathname} />

      <div className="flex min-h-dvh flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-20 border-b border-border bg-bg/80 pt-safe backdrop-blur md:hidden">
          <div className="flex h-14 items-center justify-between px-safe">
            <Link href="/today" className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icon.svg" alt="" className="h-7 w-7 rounded-lg" />
              <span className="font-bold tracking-tight text-fg">Morchitask</span>
            </Link>
            <div className="flex items-center gap-0.5">
              <TopBarIcon href="/focus" label="Foco" icon={Timer} />
              <TopBarIcon href="/resumen" label="Resumen" icon={BarChart3} />
              <TopBarIcon href="/settings" label="Ajustes" icon={Settings} />
            </div>
          </div>
        </header>

        <main className="flex-1 px-safe md:px-8 md:py-2">{children}</main>

        {/* Mobile bottom nav */}
        <nav className="sticky bottom-0 z-20 border-t border-border bg-bg/90 pb-safe backdrop-blur md:hidden">
          <div className="flex">
            {BOTTOM_NAV.map(({ href, label, icon: Icon, match }) => {
              const active = match(pathname);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex flex-1 flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors",
                    active ? "text-primary" : "text-muted hover:text-fg",
                  )}
                >
                  <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 2} aria-hidden />
                  {label}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>

      <TaskDetailSheet />
    </div>
  );
}

function DesktopSidebar({ pathname }: { pathname: string }) {
  const channelsQ = useChannels();
  const me = useMe().data;

  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border bg-surface/50 md:flex">
      <div className="flex h-16 items-center gap-2.5 px-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="" className="h-8 w-8 rounded-xl shadow-soft" />
        <span className="text-[15px] font-extrabold tracking-tight text-fg">Morchitask</span>
      </div>

      <nav className="flex flex-col gap-0.5 px-3">
        {PLAN_NAV.map((item) => (
          <SidebarLink key={item.href} item={item} pathname={pathname} />
        ))}
        <div className="my-2 border-t border-border/70" />
        {TOOL_NAV.map((item) => (
          <SidebarLink key={item.href} item={item} pathname={pathname} />
        ))}
      </nav>

      <ChannelsSection channels={channelsQ.data ?? []} />

      <div className="px-3 pb-1">
        <SidebarLink
          item={{
            href: "/settings",
            label: "Ajustes",
            icon: Settings,
            match: (p) => p.startsWith("/settings"),
          }}
          pathname={pathname}
        />
      </div>

      <div className="mt-auto flex items-center gap-2.5 border-t border-border px-4 py-3.5">
        <OwnerAvatar profile={me ?? undefined} size={32} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-fg">{me?.display_name ?? "…"}</p>
          <p className="truncate text-xs text-subtle">Tu espacio</p>
        </div>
        <SignOutButton />
      </div>
    </aside>
  );
}

function ChannelsSection({
  channels,
}: {
  channels: { id: string; name: string; color: string }[];
}) {
  const create = useCreateChannel();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  function add() {
    const n = name.trim();
    if (!n) return;
    create.mutate({ name: n, color: CHANNEL_COLORS[channels.length % CHANNEL_COLORS.length] });
    setName("");
    setAdding(false);
  }

  return (
    <div className="mt-5 flex min-h-0 flex-1 flex-col px-3">
      <div className="flex items-center justify-between px-2 pb-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-subtle">
          Categorías
        </span>
        <button
          onClick={() => setAdding((a) => !a)}
          aria-label="Agregar categoría"
          className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-md text-subtle transition-colors hover:bg-surface-2 hover:text-fg"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>

      <ul className="flex flex-col gap-0.5 overflow-y-auto">
        {channels.map((c) => (
          <li
            key={c.id}
            className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-muted"
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: c.color }}
              aria-hidden
            />
            <span className="truncate">{c.name}</span>
          </li>
        ))}
        {adding && (
          <li className="flex items-center gap-2.5 rounded-lg px-2 py-1">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: CHANNEL_COLORS[channels.length % CHANNEL_COLORS.length] }}
              aria-hidden
            />
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={add}
              onKeyDown={(e) => {
                if (e.key === "Enter") add();
                if (e.key === "Escape") {
                  setName("");
                  setAdding(false);
                }
              }}
              placeholder="Nombre de la categoría…"
              aria-label="Nueva categoría"
              className="w-full bg-transparent text-sm text-fg placeholder:text-subtle outline-none"
            />
          </li>
        )}
      </ul>
    </div>
  );
}

function SidebarLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = item.match(pathname);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors",
        active
          ? "bg-primary-soft font-semibold text-primary"
          : "font-medium text-muted hover:bg-surface-2 hover:text-fg",
      )}
    >
      <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.4 : 2} aria-hidden />
      {item.label}
    </Link>
  );
}

function TopBarIcon({
  href,
  label,
  icon: Icon,
}: {
  href: string;
  label: string;
  icon: typeof Settings;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg"
    >
      <Icon className="h-[18px] w-[18px]" aria-hidden />
    </Link>
  );
}
