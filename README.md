# Morchitask

> A Sunsama-inspired daily planning PWA — plan your day with intention, time-block it, and close it out. Built as a shared workspace for two people.

**Live app:** https://productivity-app-three-pink.vercel.app

Morchitask is a calm, opinionated productivity app built around a daily ritual: a **morning plan**, a day spent **time-blocking** against your real capacity, and an **evening shutdown**. It's a real product used every day by two people who share one household workspace, with each task, category, and goal scoped to its owner. Installable as a PWA on iPhone, available in Spanish and English, and syncs both ways with Google Calendar.

---

## Highlights

A few things worth a closer look from an engineering standpoint:

- **Multi-tenancy enforced in application code, and tested like it.** Two people share a "household" but own their own data. This app used to lean on Postgres Row-Level Security; moving to Neon dropped it, so isolation is now every query threading `householdId` through from the session. That works right up until one query forgets — and a forgotten scope is invisible in review, in types, and in every other test here, because they all run against a single tenant. So [`lib/db/queries/isolation.test.ts`](lib/db/queries/isolation.test.ts) boots a **real Postgres** (pglite, WASM), replays every migration into it, seeds two households, and asserts that asking as A never returns a row belonging to B.
- **Two-way Google Calendar sync.** Scheduling a task creates, updates and deletes a real Calendar event; shared tasks invite the other household member. The refresh token is never sent to the browser — the exchange happens server-side in [`lib/google.ts`](lib/google.ts).
- **Timezone-correct scheduling.** Day and week boundaries go through `date-fns-tz` and are covered by tests, so a 9pm task never silently lands on the wrong day.
- **Fully translatable, with the failure mode designed for.** Every string lives in `messages/{es,en}.json`. i18n breaks by _omission_, so two lint rules reject a new hardcoded string, a script (`npm run i18n:scan`) reads the JSX for the shapes lint can't see, and a test parses both catalogs with the ICU parser to check they agree on placeholders — a `{planned}` in one language and a `{amount}` in the other renders a literal curly brace on screen with no error at all.
- **Tested where it matters.** 399 Vitest tests over the tricky pure logic (date math, ordering, capacity, timezone formatting) plus real-Postgres tests for the data layer. Pre-commit hooks run lint + format.

---

## Features

**Planning rituals**

- **Morning plan** (`/plan/[date]`) — set the day's focus, pull in what rolled over from yesterday or the backlog, and adjust estimates while a sticky panel shows what it costs.
- **Capacity bar** — planned time vs. your daily target; it turns amber/red when you over-commit and suggests what to move.
- **Evening shutdown** (`/shutdown/[date]`) — three steps: what got done (estimated vs. actually tracked), a mood and a note, and where each leftover goes. Confetti when everything's closed.

**Views**

- **Day** — List + Agenda tabs. Drag to reorder, drag straight from the list onto a time on the calendar, and resize blocks like in Google Calendar (15-min snapping).
- **Week** — wide, scrolling day columns with per-day load bars and compact cards.
- **Month** — calendar overview with per-day activity dots.
- **Backlog** — undated tasks, each showing how long it's been waiting.
- **Goals** (`/metas`) — weekly and monthly objectives; tasks link to one and each shows progress.
- **Routines** (`/routines`) — tasks that create themselves daily or on chosen weekdays.
- **Summary** (`/resumen`) — completion, estimate-vs-actual and time per category over a week or a month.

**Focus & time**

- **Focus mode** with a Pomodoro-style timer, end-of-block chime and notification, background soundscapes, and optional Spotify playback.
- **Per-task timer** (real vs. estimated) that survives reloads and keeps running in the background, with a day-by-day breakdown you can correct by hand.

**Quality-of-life**

- Installable **PWA** with iOS home-screen install.
- **Spanish and English**, switchable in Settings; the choice is stored on your profile, so it follows you to another device.
- **Daily 8am push reminder** to plan your day, plus per-task reminders — each sent in the recipient's own language.
- **⌘K command palette**, keyboard shortcuts, swipe-to-complete on mobile.
- **Light / dark mode** with design tokens.
- **Per-person categories** with 16 colors, and file attachments on tasks.

---

## Tech Stack

| Layer        | Choice                                                                     |
| ------------ | -------------------------------------------------------------------------- |
| Framework    | **Next.js 16** (App Router, React Server Components, Server Actions)       |
| UI           | **React 19**, **TypeScript**, **Tailwind CSS v4**                          |
| State / data | **TanStack Query** (optimistic updates), **Zustand**                       |
| Database     | **Neon** Postgres + **Drizzle ORM** (typed schema and migrations)          |
| Auth         | **Auth.js v5** (`next-auth`) + Drizzle adapter, Google OAuth, DB sessions  |
| Storage      | **Vercel Blob** (task attachments, avatars)                                |
| i18n         | **next-intl** — cookie for rendering, `profiles.locale` as source of truth |
| Interactions | **dnd-kit** (drag & drop), **Framer Motion** (animation)                   |
| PWA / push   | **Serwist** (service worker), **web-push** (VAPID)                         |
| Dates        | **date-fns** / **date-fns-tz**                                             |
| Tooling      | **Vitest**, **pglite**, ESLint, Prettier, Husky + lint-staged              |

---

## Architecture

```
app/
├── (auth)/login/         # Google sign-in
├── (app)/                # Authenticated app shell
│   ├── today, day/[date] # Day view (List + Agenda)
│   ├── plan/[date]       # Morning planning ritual
│   ├── shutdown/[date]   # Evening shutdown ritual
│   ├── week, month       # Calendar views
│   ├── backlog, metas    # Backlog & goals
│   ├── routines, resumen # Recurring tasks & stats
│   ├── focus             # Focus / Pomodoro
│   └── settings
└── api/
    ├── auth/[...nextauth]  # Auth.js
    ├── calendar/           # Google Calendar read + block writes
    ├── cron/               # Daily plan push, task reminders
    ├── tasks/              # Search, counts, ranges
    └── attachments/        # Blob upload + fetch

components/               # Feature-grouped UI (day/, week/, tasks/, plan/, ui/ …)
lib/
├── actions/              # Server Actions — every mutation, session-scoped
├── db/                   # Drizzle schema + queries (all take householdId)
├── queries/              # TanStack Query hooks wrapping the actions
├── stores/               # Zustand (running timers, task detail, palette)
└── *.ts (+ *.test.ts)    # Pure logic: dates, ordering, capacity, i18n keys
messages/                 # es.json / en.json — every user-visible string
drizzle/migrations/       # Schema migrations
```

**Data flow:** components read and mutate through `lib/queries/*`, which wrap **Server Actions** from `lib/actions/*` in TanStack Query with optimistic updates. Every action starts with `requireSession()` and every database query takes a `householdId` — that is the authorization boundary, so it lives in one reviewable place rather than being sprinkled through the UI. Secrets (Google token refresh, calendar writes, push delivery) never reach the client.

**A note on the crons.** `daily-plan` is declared in `vercel.json` and runs at 11:00 UTC (08:00 in Buenos Aires). `task-reminders` is **not**: it needs to run every few minutes, so an external Upstash QStash schedule calls it. That means nothing in this repo will tell you if that schedule stops — and that adding it to `vercel.json` without removing the QStash one would send every reminder twice. Both routes reject requests when `CRON_SECRET` is unset; they fail closed on purpose.

**A note on offline.** The app installs as a PWA and its shell is precached, but **there is no offline data layer**: API traffic is `NetworkOnly` in the service worker on purpose, because caching one person's tasks and serving them to whoever opens the app next is worse than an empty list. Persisting the query cache to IndexedDB (offline _reads_) is a modest change; offline _mutations_ with replay on reconnect is a much bigger one. Neither is built — this section will say so until one of them is.

---

## Running locally

```bash
# 1. Install
npm install

# 2. Configure environment
cp .env.example .env.local
# Fill in DATABASE_URL, AUTH_SECRET and the Google OAuth pair at minimum.

# 3. Apply the schema
npm run db:migrate

# 4. Run
npm run dev          # http://localhost:3000
```

You'll need a Postgres database ([Neon](https://neon.tech)'s free tier is what this runs on) and Google OAuth credentials — sign-in won't work without them, since Google is currently the only provider. Every variable is documented in [`.env.example`](.env.example), and the Google setup is walked through in [`docs/GOOGLE_SETUP.md`](docs/GOOGLE_SETUP.md).

---

## Scripts

| Command              | What it does                                           |
| -------------------- | ------------------------------------------------------ |
| `npm run dev`        | Start the dev server                                   |
| `npm run build`      | Production build                                       |
| `npm run typecheck`  | TypeScript, no emit                                    |
| `npm run lint`       | ESLint                                                 |
| `npm test`           | Vitest (399 tests, some against a real Postgres)       |
| `npm run i18n:scan`  | Find user-visible text that isn't in a message catalog |
| `npm run db:migrate` | Apply Drizzle migrations                               |
| `npm run e2e`        | Playwright against a real build (it starts it itself)  |
| `npm run format`     | Prettier                                               |

`npm run e2e` runs Playwright against a real production build that the config starts itself. It covers what a logged-out visitor gets: route protection, that data endpoints serve nothing, that the interface really does render in English when the locale cookie says so, the security headers, and the PWA manifest. Anything needing a session is not covered — that needs a real Postgres _and_ Neon's HTTP proxy in front of it, since `lib/db/client.ts` speaks Neon's wire protocol rather than plain pg.

---

## Status

Actively used and maintained. The planning rituals, calendar sync, focus timer, routines and goals are all shipped, and the interface is fully translated. Next up: rate limiting, error tracking, and an end-to-end suite.

<sub>Built by <a href="https://github.com/lucasfmujica">@lucasfmujica</a>.</sub>
