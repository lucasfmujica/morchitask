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
  Moon,
  PanelLeft,
  PanelLeftClose,
  Repeat,
  Search,
  Settings,
  Sun,
  Target,
  Timer,
  X,
} from "lucide-react";
import { useMe, useProfiles } from "@/lib/queries/profiles";
import { useHousehold } from "@/lib/queries/households";
import { ChannelFilterProvider } from "@/lib/channel-filter";
import { useSidebar } from "@/lib/stores/sidebar";
import { bindActiveTimersToUser } from "@/lib/stores/active-timer";
import { useCommandPalette } from "@/lib/stores/command-palette";
import { MOD, shortcutKeys, useIsApple } from "@/lib/shortcuts";
import { todayISO } from "@/lib/date";
import { useDailyNote } from "@/lib/queries/daily-notes";
import { DEFAULT_END_TARGET_MIN } from "@/lib/scheduling";
import { minutesToHHMM } from "@/components/day/use-agenda-scheduling";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/toaster";
import { OwnerAvatar } from "@/components/tasks/owner-avatar";
import { TaskDetailSheet } from "@/components/tasks/task-detail-sheet";
import { CommandPalette } from "./command-palette";
import { KeyboardShortcuts } from "./keyboard-shortcuts";
import { PresenceBanner } from "./presence-banner";
import { MobileRitualIcons } from "./ritual-nav";
import { TimerBar } from "./timer-bar";
import { StintSync } from "./stint-sync";
import { useTranslations } from "next-intl";

type NavItem = {
  href: string;
  /** A key into the `nav` catalog, resolved at render — not the words. */
  labelKey: string;
  icon: typeof CalendarCheck;
  match: (p: string) => boolean;
};

// The desktop sidebar draws the canvas's own glyphs, keyed by labelKey: lucide's
// set reads heavier and didn't match the approved artboard. Paths copied from
// it, on a 16×16 box at stroke 1.5. The phone's bottom bar keeps lucide.
const GLYPH = {
  today: "M8 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5",
  plan: "M3 4h10M3 8h7M3 12h5",
  week: "M2 3h12v11H2zM2 6.5h12M6 6.5V14M10 6.5V14",
  month: "M2 3h12v11H2zM2 6.5h12M5.5 1.5v3M10.5 1.5v3",
  focus: "M8 2.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11M8 5v3l2 1.5",
  backlog: "M2 5h12v8.5H2zM3.5 2.5h9L14 5H2z",
  goals: "M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5",
  routines: "M2.5 8a5.5 5.5 0 1 0 1.8-4.1M2.5 2.5v3h3",
  summary: "M3 13V9M6.5 13V5M10 13V7.5M13.5 13V3",
  settings: "M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2",
  help: "M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13M6.2 6.2a1.9 1.9 0 1 1 2.6 1.7c-.5.3-.8.7-.8 1.3v.3M8 11.5h.01",
} as const;

const LOCK_GLYPH = "M3.5 7.5h9v6.5h-9zM5.5 7.5V5a2.5 2.5 0 0 1 5 0v2.5";
const SEARCH_GLYPH = "M7 2.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9M10.5 10.5l3 3";

// Grouped like Sunsama: planning views, then tools.
// Semana and Mes link to the dated route directly: the bare /week and /month
// only redirect there, which cost a second server round trip on every click.
function planNav(today: string): NavItem[] {
  return [
    {
      href: "/today",
      labelKey: "today",
      icon: CalendarCheck,
      match: (p) => p === "/today" || p.startsWith("/day"),
    },
    {
      href: `/week/${today}`,
      labelKey: "week",
      icon: CalendarRange,
      match: (p) => p.startsWith("/week"),
    },
    {
      href: `/month/${today}`,
      labelKey: "month",
      icon: CalendarDays,
      match: (p) => p.startsWith("/month"),
    },
  ];
}
const TOOL_NAV: NavItem[] = [
  { href: "/focus", labelKey: "focus", icon: Timer, match: (p) => p.startsWith("/focus") },
  { href: "/backlog", labelKey: "backlog", icon: Inbox, match: (p) => p.startsWith("/backlog") },
  {
    href: "/routines",
    labelKey: "routines",
    icon: Repeat,
    match: (p) => p.startsWith("/routines"),
  },
  { href: "/metas", labelKey: "goals", icon: Target, match: (p) => p.startsWith("/metas") },
  {
    href: "/resumen",
    labelKey: "summary",
    icon: BarChart3,
    match: (p) => p.startsWith("/resumen"),
  },
];

/** The desktop sidebar, in the canvas order. Planificar carries today's date. */
function sidebarNav(today: string): NavItem[] {
  const plan = planNav(today);
  return [
    plan[0], // Hoy
    {
      href: `/plan/${today}`,
      labelKey: "plan",
      icon: Sun,
      match: (p) => p.startsWith("/plan"),
    },
    plan[1], // Semana
    plan[2], // Mes
    TOOL_NAV[0], // Foco
    TOOL_NAV[1], // Backlog
    TOOL_NAV[3], // Metas
    TOOL_NAV[2], // Rutinas
    TOOL_NAV[4], // Resumen
    {
      href: "/settings",
      labelKey: "settings",
      icon: Settings,
      // Plan y pago is reached from Ajustes, so it lights Ajustes up.
      match: (p) => p.startsWith("/settings") || p.startsWith("/billing"),
    },
  ];
}

/** Ayuda sits at the foot of the sidebar, apart from the list: reachable from
 *  every screen, but not one more place to visit every day. */
const HELP_NAV: NavItem = {
  href: "/help",
  labelKey: "help",
  icon: Settings,
  match: (p) => p.startsWith("/help"),
};

/** What stays open once the paywall closes, mirroring proxy.ts's list: the
 *  rest of the sidebar is still drawn, locked, so nothing looks deleted. */
function reachableWhenLocked(href: string) {
  return href === "/settings" || href === "/billing";
}

/**
 * The phone's five: the day, the week, the two inboxes you pull from, and the
 * ritual that ends the day. Mes, Rutinas, Foco, Resumen and Ajustes moved to
 * the drawer — a six/seven-item bar was 55px per target on a 390px screen and
 * two of those items were places you visit once a week.
 *
 * "Cerrar" is a route with today's date in it, so it's built per render.
 */
function bottomNav(today: string): NavItem[] {
  const plan = planNav(today);
  return [
    plan[0], // Hoy
    plan[1], // Semana
    TOOL_NAV[1], // Backlog
    TOOL_NAV[3], // Metas
    {
      href: `/shutdown/${today}`,
      labelKey: "shutdown",
      icon: Moon,
      match: (p) => p.startsWith("/shutdown"),
    },
  ];
}

/** Closing the day is a ritual, not a page you browse: the chrome steps back so
 *  the three steps have the screen. Cheaper and more reversible than moving the
 *  route into its own group, which would mean re-mounting every singleton this
 *  shell owns (detail sheet, timer bar, shortcuts, palette, presence). */
export function isRitualRoute(pathname: string) {
  return pathname.startsWith("/shutdown") || pathname.startsWith("/review");
}

/**
 * `trialChip` is rendered by the server (it reads the session) and handed in
 * here, since this shell is a client component. It is null for everyone not on
 * a live trial.
 */
export function AppChrome({
  children,
  trialChip = null,
  locked = false,
}: {
  children: ReactNode;
  trialChip?: ReactNode;
  /** Trial over and nothing paid: the proxy only lets Plan y pago and Ajustes
   *  through, and the sidebar says so instead of linking to redirects. */
  locked?: boolean;
}) {
  const tn = useTranslations("nav");
  const pathname = usePathname();
  const ritual = isRitualRoute(pathname);

  // Any navigation closes the mobile drawer (covers ritual links too).
  const closeMobile = useSidebar((s) => s.closeMobile);
  useEffect(() => {
    closeMobile();
  }, [pathname, closeMobile]);

  // Running stopwatches are stored per person: load this person's, and only
  // once we know who they are (see lib/stores/active-timer.ts).
  const meId = useMe().data?.id;
  useEffect(() => {
    if (meId) bindActiveTimersToUser(meId);
  }, [meId]);

  return (
    <ChannelFilterProvider>
      <div className="flex min-h-dvh">
        <DesktopSidebar
          pathname={pathname}
          forceCollapsed={ritual}
          trialChip={trialChip}
          locked={locked}
        />

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
              {/* Two actions, not six: the page owns its own header now, and
                  Foco / Resumen / Ajustes live in the drawer. */}
              <div className="flex items-center gap-0.5">
                <SearchButton />
                <MobileRitualIcons />
              </div>
            </div>
          </header>

          <PresenceBanner />

          {/* 16px all round on desktop, as every canvas artboard has it. */}
          <main className="flex-1 px-safe py-5 md:p-4">{children}</main>

          {/* Mobile bottom nav — hidden during a ritual so the step CTA is
              the only thing at the bottom of the screen. */}
          <nav
            className={cn(
              "sticky bottom-0 z-20 border-t border-border bg-bg/90 pb-safe backdrop-blur md:hidden",
              ritual && "hidden",
            )}
          >
            <div className="flex">
              {bottomNav(todayISO()).map(({ href, labelKey, icon: Icon, match }) => {
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
                    {tn(labelKey)}
                  </Link>
                );
              })}
            </div>
          </nav>
        </div>

        <MobileSidebarDrawer pathname={pathname} trialChip={trialChip} locked={locked} />
        <TaskDetailSheet />
        <TimerBar />
        <KeyboardShortcuts />
        <CommandPalette />
        <Toaster />
        <StintSync />
      </div>
    </ChannelFilterProvider>
  );
}

function MobileMenuButton() {
  const tc = useTranslations("chrome");
  const openMobile = useSidebar((s) => s.openMobile);
  return (
    <button
      onClick={openMobile}
      aria-label={tc("openMenu")}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg"
    >
      <Menu className="h-5 w-5" aria-hidden />
    </button>
  );
}

/** Opens the ⌘K palette from the mobile top bar — a phone has no ⌘K. */
function SearchButton() {
  const tcm = useTranslations("common");
  const open = useCommandPalette((s) => s.open);
  return (
    <button
      onClick={open}
      aria-label={tcm("search")}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg"
    >
      <Search className="h-5 w-5" aria-hidden />
    </button>
  );
}

function DesktopSidebar({
  pathname,
  forceCollapsed = false,
  trialChip,
  locked,
}: {
  pathname: string;
  forceCollapsed?: boolean;
  trialChip: ReactNode;
  locked: boolean;
}) {
  const tc = useTranslations("chrome");
  const collapsed = useSidebar((s) => s.collapsed) || forceCollapsed;
  const toggleCollapsed = useSidebar((s) => s.toggleCollapsed);

  // Collapsed: hide the panel and leave a slim floating button to reopen it, so
  // the day/week columns get the full width back.
  if (collapsed) {
    return (
      <button
        onClick={toggleCollapsed}
        aria-label={tc("showMenu")}
        title={tc("showMenu")}
        className="sticky top-0 z-20 mt-4 ml-4 hidden h-9 w-9 shrink-0 items-center justify-center self-start rounded-lg border border-border bg-surface text-muted shadow-soft transition-colors hover:bg-surface-2 hover:text-fg md:flex"
      >
        <PanelLeft className="h-5 w-5" aria-hidden />
      </button>
    );
  }

  return (
    // The canvas frame: 16px from the window, 220px wide, a 28px-radius well.
    <aside className="sticky top-4 my-4 ml-4 hidden h-[calc(100dvh-2rem)] w-[220px] shrink-0 animate-up flex-col overflow-hidden rounded-[28px] bg-surface-2 px-3 py-5 md:flex">
      <SidebarBody
        pathname={pathname}
        onToggleCollapsed={toggleCollapsed}
        trialChip={trialChip}
        locked={locked}
      />
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
  trialChip,
  locked,
}: {
  pathname: string;
  onToggleCollapsed?: () => void;
  onNavigate?: () => void;
  trialChip: ReactNode;
  locked: boolean;
}) {
  const tc = useTranslations("chrome");
  const tb = useTranslations("billing");
  const tn = useTranslations("nav");
  const me = useMe().data;
  const profiles = useProfiles().data ?? [];
  const household = useHousehold().data;
  // "Cierre a las" is today's own end target (set on the agenda), so the
  // sidebar and the agenda never disagree about when the day ends.
  const endTarget = useDailyNote(todayISO()).data?.end_target_min ?? DEFAULT_END_TARGET_MIN;

  return (
    <>
      <div className="flex shrink-0 items-center gap-2 px-3 pb-3.5">
        <span className="font-display text-xl leading-6 font-semibold tracking-[-0.01em] text-fg">
          Morchitask
        </span>
        <div className="ml-auto flex">
          {onToggleCollapsed && (
            <button
              onClick={onToggleCollapsed}
              aria-label={tc("hideMenu")}
              title={tc("hideMenu")}
              className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-pill text-muted transition-colors hover:bg-surface/60 hover:text-fg"
            >
              <PanelLeftClose className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            </button>
          )}
          {onNavigate && (
            <button
              onClick={onNavigate}
              aria-label={tc("closeMenu")}
              className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-pill text-muted transition-colors hover:bg-surface/60 hover:text-fg"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>
      </div>

      {/* Looks like a search field and opens the palette: ⌘K was only ever
          discoverable through the "?" overlay, which nobody opens. */}
      {!locked && <SearchPill onOpen={onNavigate} />}

      {/* The canvas sidebar: one flat list of places, the capture verb, and the
          two of you at the foot. Categories and sign-out live in Ajustes. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <nav className="flex flex-col gap-0.5">
          {sidebarNav(todayISO()).map((item) => (
            <SidebarLink
              key={item.href}
              item={item}
              pathname={pathname}
              onNavigate={onNavigate}
              locked={locked && !reachableWhenLocked(item.href)}
            />
          ))}
        </nav>
        {!locked && (
          <Link
            href="/today?capture=1"
            onClick={onNavigate}
            className="mt-3 flex h-10 shrink-0 items-center gap-2.5 rounded-pill bg-fg px-3.5 text-sm font-semibold text-surface transition-opacity hover:opacity-90"
          >
            <svg
              viewBox="0 0 16 16"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              aria-hidden
            >
              <rect x="5.5" y="1.5" width="5" height="8.5" rx="2.5" />
              <path d="M3 7.5a5 5 0 0 0 10 0M8 12.5v2" />
            </svg>
            {tn("capture")}
          </Link>
        )}
      </div>

      {locked ? (
        <p className="mt-3 shrink-0 rounded-[20px] bg-surface/60 px-3.5 py-3 text-2xs leading-[17px] text-muted shadow-[inset_0_0_0_1px_var(--color-border)]">
          {tb.rich("lockedNav", { b: (c) => <b className="font-semibold text-fg">{c}</b> })}
        </p>
      ) : (
        <div className="mt-3 shrink-0">
          <SidebarLink item={HELP_NAV} pathname={pathname} onNavigate={onNavigate} locked={false} />
        </div>
      )}

      {/* Pinned above the footer like the footer itself, so a long nav list
          scrolls under it instead of pushing it out of sight. The chip carries
          its own spacing: it renders nothing off-trial, and the footer must
          then sit exactly where it always has. */}
      {trialChip}

      <Link
        href="/settings"
        onClick={onNavigate}
        title={household?.name || tc("yourSpace")}
        className="mt-3 flex shrink-0 flex-col gap-2.5 rounded-[22px] bg-surface p-3.5 transition-shadow hover:shadow-soft"
      >
        <span className="flex">
          {(profiles.length ? profiles : me ? [me] : []).map((p, i) => (
            <span key={p.id} className={cn("rounded-full ring-2 ring-surface", i > 0 && "-ml-2")}>
              <OwnerAvatar profile={p} size={30} />
            </span>
          ))}
        </span>
        <span className="truncate text-2xs text-muted">
          {tc.rich("closesAt", {
            time: minutesToHHMM(endTarget),
            t: (chunks) => <span className="font-mono text-fg">{chunks}</span>,
          })}
        </span>
      </Link>
    </>
  );
}

/** Slide-in sidebar for mobile — same contents as the desktop panel, opened via
 *  the hamburger in the top bar. */
function MobileSidebarDrawer({
  pathname,
  trialChip,
  locked,
}: {
  pathname: string;
  trialChip: ReactNode;
  locked: boolean;
}) {
  const tc = useTranslations("chrome");
  const mobileOpen = useSidebar((s) => s.mobileOpen);
  const closeMobile = useSidebar((s) => s.closeMobile);
  if (!mobileOpen) return null;
  return (
    <div className="fixed inset-0 z-40 md:hidden">
      <button
        aria-label={tc("closeMenu")}
        onClick={closeMobile}
        className="absolute inset-0 h-full w-full cursor-default bg-scrim backdrop-blur-sm"
      />
      <aside className="absolute inset-y-0 left-0 flex w-[82%] max-w-xs flex-col bg-surface-2 px-3 pt-[max(1.25rem,env(safe-area-inset-top))] pb-5 shadow-card">
        <SidebarBody
          pathname={pathname}
          onNavigate={closeMobile}
          trialChip={trialChip}
          locked={locked}
        />
      </aside>
    </div>
  );
}

function SidebarLink({
  item,
  pathname,
  onNavigate,
  locked,
}: {
  item: NavItem;
  pathname: string;
  onNavigate?: () => void;
  /** Shown, dimmed and padlocked, but leading to Plan y pago: following it
   *  would only bounce off the proxy's redirect. */
  locked: boolean;
}) {
  const tn = useTranslations("nav");
  const tb = useTranslations("billing");
  const active = !locked && item.match(pathname);
  const glyph = GLYPH[item.labelKey as keyof typeof GLYPH];
  return (
    <Link
      href={locked ? "/billing" : item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      aria-label={locked ? tb("lockedNavItem", { label: tn(item.labelKey) }) : undefined}
      className={cn(
        "flex h-10 shrink-0 items-center gap-2.5 rounded-pill px-3.5 text-sm transition-colors",
        active
          ? "bg-surface font-semibold text-fg shadow-nav"
          : locked
            ? "font-medium text-subtle opacity-55 hover:bg-surface/60"
            : "font-medium text-muted hover:bg-surface/60 hover:text-fg",
      )}
    >
      <svg
        viewBox="0 0 16 16"
        className="h-4 w-4 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d={glyph} />
      </svg>
      <span className="flex-1">{tn(item.labelKey)}</span>
      {locked && (
        <svg
          viewBox="0 0 16 16"
          className="h-3 w-3 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d={LOCK_GLYPH} />
        </svg>
      )}
    </Link>
  );
}

/** "Buscar o ir a…": a field that is really a button into the ⌘K palette. */
function SearchPill({ onOpen }: { onOpen?: () => void }) {
  const tc = useTranslations("chrome");
  const open = useCommandPalette((s) => s.open);
  const apple = useIsApple();
  return (
    <button
      type="button"
      onClick={() => {
        onOpen?.();
        open();
      }}
      className="mb-2.5 flex h-[38px] shrink-0 cursor-pointer items-center gap-2.5 rounded-pill bg-surface/55 pr-1.5 pl-3.5 text-left text-subtle shadow-[inset_0_0_0_1px_var(--color-border)] transition-[background-color,box-shadow] hover:bg-surface hover:shadow-soft"
    >
      <svg
        viewBox="0 0 16 16"
        className="h-[15px] w-[15px] shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        aria-hidden
      >
        <path d={SEARCH_GLYPH} />
      </svg>
      <span className="min-w-0 flex-1 truncate text-xs">{tc("searchOrGo")}</span>
      <kbd className="rounded-[6px] bg-surface-2 px-[7px] py-[3px] font-mono text-[11px] text-subtle">
        {shortcutKeys([MOD, "K"], apple).join(apple ? "" : " ")}
      </kbd>
    </button>
  );
}
