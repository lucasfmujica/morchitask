# Morchitask

> A Sunsama-inspired daily planning PWA — plan your day with intention, time-block it, and close it out. Built as a shared workspace for two people.

**Live app:** https://productivity-app-three-pink.vercel.app

Morchitask is a calm, opinionated productivity app built around a daily ritual: a **morning plan**, a day spent **time-blocking** against your real capacity, and an **evening shutdown**. It's a real product used every day by two people who share one household workspace, with each task, category, and goal scoped to its owner. Installable as a PWA on iPhone, works offline, and syncs both ways with Google Calendar.

> The UI is in Spanish (it was built for its two real users). This README is in English for reach.

---

## Highlights

A few things worth a closer look from an engineering standpoint:

- **Multi-tenant by Row-Level Security.** Two users share one "household" but own their own data. Access is enforced in Postgres with RLS policies — not in the app layer — so a query physically can't return someone else's rows. Shared tasks are an explicit, scoped exception.
- **Offline-first, optimistic UI.** TanStack Query with an IndexedDB-persisted cache means the app opens instantly and stays usable offline; mutations apply optimistically and reconcile on reconnect. Reordering, completing, and scheduling all feel instant.
- **Two-way Google Calendar sync.** Scheduling a task creates/updates/deletes a real Google Calendar event via a Supabase Edge Function; shared tasks invite the other household member. OAuth tokens never touch the client — refresh + write happen server-side.
- **Timezone-correct scheduling.** Time-blocking and the day/week boundaries are handled with `date-fns-tz` and covered by tests, so a 9pm task never silently lands on the wrong day.
- **Tested where it matters.** Vitest unit tests for the tricky pure logic (date math, ordering, capacity, timezone-aware formatting) and Playwright for end-to-end flows. Pre-commit hooks run lint + format so `main` stays clean.

---

## Features

**Planning rituals**

- **Morning plan** (`/plan/[date]`) — set the day's focus, pull in what rolled over from yesterday or the backlog, and adjust estimates.
- **Capacity bar** — see planned time vs. your daily target; it turns amber/red when you over-commit.
- **Evening shutdown** (`/shutdown/[date]`) — review and close the day, with confetti when everything's done.

**Views**

- **Day** — List + Agenda tabs. Drag tasks to reorder, drag straight from the list onto a time on the calendar, and resize blocks like in Google Calendar (15-min snapping).
- **Week** — Sunsama-style wide, scrolling day columns with per-day progress bars and rich cards (inline checklist, duration chip, scheduled time, category).
- **Month** — calendar overview with per-day activity dots.
- **Backlog** — undated tasks waiting for a home.
- **Goals** (`/metas`) — weekly/monthly objectives; tasks link to a goal and each goal shows a progress bar.

**Focus & time**

- **Focus mode** with a Pomodoro-style timer, end-of-block chime, and notification.
- **Per-task timer** (real vs. estimated time) that survives app reloads and keeps running in the background.

**Quality-of-life**

- Installable **PWA** (offline support, iOS home-screen install).
- **Two-way Google Calendar sync** + read-only display of your external calendar events inside the Day view.
- **Daily 8am push reminder** to plan your day.
- **⌘K command palette**, full keyboard shortcuts, swipe-to-complete on mobile.
- **Light / dark mode** with design tokens.
- **Per-person categories** with 16 colors.

---

## Tech Stack

| Layer        | Choice                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------- |
| Framework    | **Next.js 16** (App Router, React Server Components)                                        |
| UI           | **React 19**, **TypeScript**, **Tailwind CSS v4**                                           |
| State / data | **TanStack Query** (optimistic + IndexedDB-persisted), **Zustand**                          |
| Backend      | **Supabase** — Postgres, Auth (Google OAuth), Row-Level Security, **Edge Functions** (Deno) |
| Interactions | **dnd-kit** (drag & drop), **Framer Motion** (animation)                                    |
| PWA          | **Serwist** (service worker)                                                                |
| Dates        | **date-fns** / **date-fns-tz**                                                              |
| Tooling      | **Vitest**, **Playwright**, ESLint, Prettier, Husky + lint-staged                           |

---

## Architecture

```
app/
├── (auth)/login/         # Google OAuth sign-in
├── (app)/                # Authenticated app shell
│   ├── today, day/[date] # Day view (List + Agenda)
│   ├── plan/[date]       # Morning planning ritual
│   ├── shutdown/[date]   # Evening shutdown ritual
│   ├── week, month       # Calendar views
│   ├── backlog, metas    # Backlog & goals
│   ├── focus             # Focus / Pomodoro
│   └── settings, resumen # Settings & summary
└── auth/callback         # OAuth callback

components/               # Feature-grouped UI (day/, week/, tasks/, plan/, ui/ …)
lib/
├── queries/              # Data layer: reads/writes via Supabase, optimistic updates
├── stores/               # Zustand stores (active timer, task detail, command palette)
├── supabase/             # Client / server / middleware clients + generated DB types
└── *.ts (+ *.test.ts)    # Pure logic: dates, ordering, capacity, formatting (unit-tested)

supabase/functions/       # Edge Functions: google-calendar(-write), send-push
```

**Data flow:** Components read and mutate through `lib/queries/*`, which wrap Supabase calls in TanStack Query with optimistic updates. The cache is persisted to IndexedDB for offline use. Security lives in Postgres (RLS), so the client is never trusted with authorization. Anything requiring secrets (Google OAuth token refresh, calendar writes, push delivery) runs in Edge Functions.

---

## Running locally

```bash
# 1. Install
npm install

# 2. Configure environment
cp .env.example .env.local
# Fill in your Supabase project URL + anon key.
# (Google Calendar sync needs extra setup — see docs/GOOGLE_SETUP.md)

# 3. Run
npm run dev          # http://localhost:3000
```

You'll need a Supabase project (Postgres + Auth) with the schema and RLS policies applied. Google sign-in and calendar sync require Google OAuth credentials — walkthrough in [`docs/GOOGLE_SETUP.md`](docs/GOOGLE_SETUP.md).

---

## Scripts

| Command             | What it does                |
| ------------------- | --------------------------- |
| `npm run dev`       | Start the dev server        |
| `npm run build`     | Production build            |
| `npm run typecheck` | TypeScript, no emit         |
| `npm run lint`      | ESLint                      |
| `npm test`          | Vitest unit tests           |
| `npm run e2e`       | Playwright end-to-end tests |
| `npm run format`    | Prettier                    |

---

## Status

Actively used and maintained. Core planning, calendar, and ritual flows are shipped; recurring routines and rollover automation are the next focus.

<sub>Built by <a href="https://github.com/lucasfmujica">@lucasfmujica</a>.</sub>
