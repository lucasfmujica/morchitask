"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  Inbox,
  Menu,
  PanelLeft,
  PanelLeftClose,
  Repeat,
  Search,
  Settings,
  Target,
  Timer,
  X,
} from "lucide-react";
import { useChannels } from "@/lib/queries/channels";
import { useMe } from "@/lib/queries/profiles";
import { useHousehold } from "@/lib/queries/households";
import { ChannelFilterProvider } from "@/lib/channel-filter";
import { useSidebar } from "@/lib/stores/sidebar";
import { useCommandPalette } from "@/lib/stores/command-palette";
import { todayISO } from "@/lib/date";
import { cn } from "@/lib/utils";
import { Kbd } from "@/components/ui";
import { OwnerAvatar } from "@/components/tasks/owner-avatar";
import { TaskDetailSheet } from "@/components/tasks/task-detail-sheet";
import { WeekCalendarRail } from "@/components/week/week-calendar-rail";
import { CommandPalette } from "./command-palette";
import { KeyboardShortcuts } from "./keyboard-shortcuts";
import { PresenceBanner } from "./presence-banner";
import { MobileRitualIcons, SidebarRituals } from "./ritual-nav";
import { SidebarChannels } from "./sidebar-channels";
import { SignOutButton } from "./sign-out-button";
import { TimerBar } from "./timer-bar";

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
  { href: "/metas", label: "Metas", icon: Target, match: (p) => p.startsWith("/metas") },
  { href: "/resumen", label: "Resumen", icon: BarChart3, match: (p) => p.startsWith("/resumen") },
];
const BOTTOM_NAV = [...PLAN_NAV, ...TOOL_NAV].filter((n) => n.bottom);

/** Closing the day is a ritual, not a page you browse: the chrome steps back so
 *  the three steps have the screen. Cheaper and more reversible than moving the
 *  route into its own group, which would mean re-mounting every singleton this
 *  shell owns (detail sheet, timer bar, shortcuts, palette, presence). */
function isRitualRoute(pathname: string) {
  return pathname.startsWith("/shutdown");
}

export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const ritual = isRitualRoute(pathname);

  // Any navigation closes the mobile drawer (covers ritual links too).
  const closeMobile = useSidebar((s) => s.closeMobile);
  useEffect(() => {
    closeMobile();
  }, [pathname, closeMobile]);

  return (
    <ChannelFilterProvider>
      <div className="flex min-h-dvh">
        <DesktopSidebar pathname={pathname} forceCollapsed={ritual} />

        {/* min-w-0 is load-bearing: a flex child defaults to `min-width: auto`,
            so this column refused to shrink below its content's intrinsic width
            and the whole page rendered ~800px wide on a 430px phone — cards,
            empty states and the bottom nav all clipped off the right edge. */}
        <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
          {/* Mobile top bar */}
          <header className="sticky top-0 z-20 border-b border-border bg-bg/80 pt-safe backdrop-blur md:hidden">
            <div className="flex h-14 items-center justify-between px-safe">
              <div className="flex items-center gap-1">
                <MobileMenuButton />
                <Link href="/today" className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/icon.svg" alt="Morchitask" className="h-7 w-7 rounded-lg" />
                  {/* The wordmark costs ~95px and the icon row now needs it:
                      with Buscar added, logo + 6 icons overflow a 390px phone.
                      Shown again as soon as there's room. */}
                  <span className="hidden font-bold tracking-tight text-fg sm:inline">
                    Morchitask
                  </span>
                </Link>
              </div>
              <div className="flex items-center gap-0.5">
                <SearchButton />
                <MobileRitualIcons />
                <TopBarIcon href="/focus" label="Foco" icon={Timer} />
                <TopBarIcon href="/resumen" label="Resumen" icon={BarChart3} />
                <TopBarIcon href="/settings" label="Ajustes" icon={Settings} />
              </div>
            </div>
          </header>

          <PresenceBanner />

          <main className="flex-1 px-safe py-5 md:px-8 md:py-6">{children}</main>

          {/* Mobile bottom nav — hidden during a ritual so the step CTA is
              the only thing at the bottom of the screen. */}
          <nav
            className={cn(
              "sticky bottom-0 z-20 border-t border-border bg-bg/90 pb-safe backdrop-blur md:hidden",
              ritual && "hidden",
            )}
          >
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

        <MobileSidebarDrawer pathname={pathname} />
        <TaskDetailSheet />
        <TimerBar />
        <KeyboardShortcuts />
        <CommandPalette />
      </div>
    </ChannelFilterProvider>
  );
}

function MobileMenuButton() {
  const openMobile = useSidebar((s) => s.openMobile);
  return (
    <button
      onClick={openMobile}
      aria-label="Abrir menú"
      className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg"
    >
      <Menu className="h-5 w-5" aria-hidden />
    </button>
  );
}

/** Opens the ⌘K palette from the mobile top bar — a phone has no ⌘K. */
function SearchButton() {
  const open = useCommandPalette((s) => s.open);
  return (
    <button
      onClick={open}
      aria-label="Buscar"
      className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg"
    >
      <Search className="h-5 w-5" aria-hidden />
    </button>
  );
}

/** The same palette, discoverable on desktop — nobody finds ⌘K on their own. */
function SidebarSearchButton() {
  const open = useCommandPalette((s) => s.open);
  return (
    <button
      onClick={open}
      aria-label="Buscar"
      className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
    >
      <Search className="h-[18px] w-[18px] shrink-0" aria-hidden />
      <span className="flex-1 text-left">Buscar</span>
      <Kbd>⌘K</Kbd>
    </button>
  );
}

function DesktopSidebar({
  pathname,
  forceCollapsed = false,
}: {
  pathname: string;
  forceCollapsed?: boolean;
}) {
  const collapsed = useSidebar((s) => s.collapsed) || forceCollapsed;
  const toggleCollapsed = useSidebar((s) => s.toggleCollapsed);

  // Collapsed: hide the panel and leave a slim floating button to reopen it, so
  // the day/week columns get the full width back.
  if (collapsed) {
    return (
      <button
        onClick={toggleCollapsed}
        aria-label="Mostrar menú"
        title="Mostrar menú"
        className="sticky top-0 z-20 mt-3 ml-2 hidden h-9 w-9 shrink-0 items-center justify-center self-start rounded-lg border border-border bg-surface text-muted shadow-soft transition-colors hover:bg-surface-2 hover:text-fg md:flex"
      >
        <PanelLeft className="h-5 w-5" aria-hidden />
      </button>
    );
  }

  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border bg-surface/50 md:flex">
      <SidebarBody pathname={pathname} onToggleCollapsed={toggleCollapsed} />
    </aside>
  );
}

/** The sidebar contents, shared by the desktop panel and the mobile drawer.
 *  `onToggleCollapsed` shows the desktop collapse button; `onNavigate` (mobile
 *  drawer) closes the drawer after a tap and shows a close button instead. */
function SidebarBody({
  pathname,
  onToggleCollapsed,
  onNavigate,
}: {
  pathname: string;
  onToggleCollapsed?: () => void;
  onNavigate?: () => void;
}) {
  const channelsQ = useChannels();
  const me = useMe().data;
  const household = useHousehold().data;
  const onWeek = pathname.startsWith("/week");
  const onSettings = pathname.startsWith("/settings");
  // Views where clicking a category filters the task list.
  const filterable =
    pathname.startsWith("/today") ||
    pathname.startsWith("/day") ||
    onWeek ||
    pathname.startsWith("/backlog");

  return (
    <>
      <div className="flex h-16 shrink-0 items-center gap-2.5 px-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="" className="h-8 w-8 rounded-xl shadow-soft" />
        <span className="text-base font-extrabold tracking-tight text-fg">Morchitask</span>
        <div className="ml-auto">
          {onToggleCollapsed && (
            <button
              onClick={onToggleCollapsed}
              aria-label="Ocultar menú"
              title="Ocultar menú"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              <PanelLeftClose className="h-5 w-5" aria-hidden />
            </button>
          )}
          {onNavigate && (
            <button
              onClick={onNavigate}
              aria-label="Cerrar menú"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          )}
        </div>
      </div>

      {/* Scrollable middle — keeps the bottom (Ajustes + perfil) reachable when
          the Week mini-calendar is shown and/or the category list is long. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <nav className="flex flex-col gap-0.5 px-3">
          <SidebarSearchButton />
          <div className="my-2 border-t border-border/70" />
          {PLAN_NAV.map((item) => (
            <SidebarLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />
          ))}
          <div className="my-2 border-t border-border/70" />
          <SidebarRituals pathname={pathname} />
          <div className="my-2 border-t border-border/70" />
          {TOOL_NAV.map((item) => (
            <SidebarLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />
          ))}
        </nav>

        {/* Mini month-calendar lives in the sidebar (Sunsama-style) on the Week
            view — picking a day jumps the columns to that week. */}
        {onWeek && (
          <div className="mt-3 px-3">
            <WeekCalendarRail date={pathname.split("/")[2] || todayISO()} />
          </div>
        )}

        <SidebarChannels channels={channelsQ.data ?? []} filterable={filterable} />
      </div>

      {/* Pinned bottom — el bloque del perfil es el acceso a Ajustes; el botón de
          salir queda al lado (no anidado en el link). */}
      <div className="flex shrink-0 items-center gap-1 border-t border-border px-2 py-2">
        <Link
          href="/settings"
          onClick={onNavigate}
          aria-current={onSettings ? "page" : undefined}
          title="Ajustes"
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors",
            onSettings ? "bg-primary-soft" : "hover:bg-surface-2",
          )}
        >
          <OwnerAvatar profile={me ?? undefined} size={32} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-fg">{me?.display_name ?? "…"}</p>
            <p className="truncate text-xs text-subtle">{household?.name || "Tu espacio"}</p>
          </div>
          <Settings
            className={cn("h-4 w-4 shrink-0", onSettings ? "text-primary" : "text-subtle")}
            aria-hidden
          />
        </Link>
        <SignOutButton />
      </div>
    </>
  );
}

/** Slide-in sidebar for mobile — same contents as the desktop panel, opened via
 *  the hamburger in the top bar. */
function MobileSidebarDrawer({ pathname }: { pathname: string }) {
  const mobileOpen = useSidebar((s) => s.mobileOpen);
  const closeMobile = useSidebar((s) => s.closeMobile);
  if (!mobileOpen) return null;
  return (
    <div className="fixed inset-0 z-40 md:hidden">
      <button
        aria-label="Cerrar menú"
        onClick={closeMobile}
        className="absolute inset-0 h-full w-full cursor-default bg-scrim backdrop-blur-sm"
      />
      <aside className="absolute inset-y-0 left-0 flex w-[82%] max-w-xs flex-col border-r border-border bg-surface pt-safe shadow-card">
        <SidebarBody pathname={pathname} onNavigate={closeMobile} />
      </aside>
    </div>
  );
}

function SidebarLink({
  item,
  pathname,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  onNavigate?: () => void;
}) {
  const active = item.match(pathname);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
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
