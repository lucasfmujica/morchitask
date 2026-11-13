/**
 * Whitelists for every object a client hands to a server action.
 *
 * A server action's arguments are whatever JSON the browser sends: the
 * TypeScript type on the parameter is a promise to ourselves, not a check.
 * Spreading such an object into `.set()` or `.values()` let a request write any
 * column it named — `household_id` on a profile moved someone into another
 * household, `owner_id` on a daily note overwrote the partner's private note.
 *
 * So each patch is rebuilt here from an explicit list of keys, and nothing else
 * survives: not ids, not owners, not timestamps, not server markers. The data
 * layer calls these too, so a new caller cannot forget them.
 */

type Picked<K extends string> = Partial<Record<K, unknown>>;

function pick<K extends string>(input: unknown, keys: readonly K[]): Picked<K> {
  const out: Picked<K> = {};
  if (!input || typeof input !== "object") return out;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      const value = (input as Record<string, unknown>)[key];
      if (value !== undefined) out[key] = value;
    }
  }
  return out;
}

const isStr = (v: unknown) => typeof v === "string";
const isNum = (v: unknown) => typeof v === "number" && Number.isFinite(v);
const strOrNull = (v: unknown) => v === null || isStr(v);
const numOrNull = (v: unknown) => v === null || isNum(v);

/** Drops keys whose value has the wrong shape, rather than letting a string
 *  reach an integer column and turn into a 500. */
function typed<T extends Record<string, unknown>>(
  obj: Partial<Record<string, unknown>>,
  checks: Record<string, (v: unknown) => boolean>,
): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (checks[k]?.(v)) out[k] = v;
  }
  return out as T;
}

// ---------------------------------------------------------------- tasks

export type TaskFieldsPatch = {
  title?: string;
  notes?: string | null;
  channel_id?: string | null;
  time_estimate_min?: number | null;
  block_start?: string | null;
  block_end?: string | null;
  owner_id?: string;
  shared?: boolean;
  objective_id?: string | null;
  remind_at?: string | null;
  reminder_sent_at?: null;
  due_date?: string | null;
  priority?: "high" | "medium" | "low" | null;
};

/**
 * The task columns a person may set by hand. `actual_time_min` is not here: it
 * is personal on a shared task and has its own write path (`setActualTime`).
 * `reminder_sent_at` may only be cleared, which is what re-arms a reminder;
 * setting it is the cron's job.
 */
export function pickTaskPatch(input: unknown): TaskFieldsPatch {
  return typed<TaskFieldsPatch>(
    pick(input, [
      "title",
      "notes",
      "channel_id",
      "time_estimate_min",
      "block_start",
      "block_end",
      "owner_id",
      "shared",
      "objective_id",
      "remind_at",
      "reminder_sent_at",
      "due_date",
      "priority",
    ] as const),
    {
      title: isStr,
      notes: strOrNull,
      channel_id: strOrNull,
      time_estimate_min: numOrNull,
      block_start: strOrNull,
      block_end: strOrNull,
      owner_id: isStr,
      shared: (v) => typeof v === "boolean",
      objective_id: strOrNull,
      remind_at: strOrNull,
      reminder_sent_at: (v) => v === null,
      due_date: strOrNull,
      priority: strOrNull,
    },
  );
}

// ---------------------------------------------------------------- profile

export type ProfileFieldsPatch = {
  display_name?: string;
  color?: string;
  capacity_target_min?: number | null;
  avatar_url?: null;
};

/**
 * What Settings may change on your own profile. Not `household_id` (that was a
 * way into any household), `avatar_url` only to clear it (only `saveMyAvatar`
 * may point it somewhere, after checking the upload), and not `notification_prefs`, which also holds
 * server-owned markers and goes through `saveMyNotificationPrefs`.
 */
export function pickProfilePatch(input: unknown): ProfileFieldsPatch {
  return typed<ProfileFieldsPatch>(
    pick(input, ["display_name", "color", "capacity_target_min", "avatar_url"] as const),
    {
      display_name: isStr,
      color: isStr,
      capacity_target_min: numOrNull,
      avatar_url: (v) => v === null,
    },
  );
}

// ---------------------------------------------------------------- notes

export type DailyNoteFields = {
  intention?: string | null;
  reflection?: string | null;
  mood?: number | null;
  capacity_min?: number | null;
  end_target_min?: number | null;
  plan_completed_at?: string | null;
  shutdown_completed_at?: string | null;
};

export function pickDailyNotePatch(input: unknown): DailyNoteFields {
  return typed<DailyNoteFields>(
    pick(input, [
      "intention",
      "reflection",
      "mood",
      "capacity_min",
      "end_target_min",
      "plan_completed_at",
      "shutdown_completed_at",
    ] as const),
    {
      intention: strOrNull,
      reflection: strOrNull,
      mood: numOrNull,
      capacity_min: numOrNull,
      end_target_min: numOrNull,
      plan_completed_at: strOrNull,
      shutdown_completed_at: strOrNull,
    },
  );
}

export type WeeklyNoteFields = {
  wins?: string | null;
  lessons?: string | null;
  next_focus?: string | null;
  completed_at?: string | null;
};

export function pickWeeklyNotePatch(input: unknown): WeeklyNoteFields {
  return typed<WeeklyNoteFields>(
    pick(input, ["wins", "lessons", "next_focus", "completed_at"] as const),
    { wins: strOrNull, lessons: strOrNull, next_focus: strOrNull, completed_at: strOrNull },
  );
}

// ---------------------------------------------------------------- routines

export type RoutineFields = {
  title?: string;
  notes?: string | null;
  freq?: string;
  weekdays?: number[] | null;
  repeat_every?: number;
  month_day?: number | null;
  time_estimate_min?: number | null;
  active_from?: string;
  active_until?: string | null;
  channel_id?: string | null;
  paused?: boolean;
};

export function pickRoutineInput(input: unknown): RoutineFields {
  return typed<RoutineFields>(
    pick(input, [
      "title",
      "notes",
      "freq",
      "weekdays",
      "repeat_every",
      "month_day",
      "time_estimate_min",
      "active_from",
      "active_until",
      "channel_id",
      "paused",
    ] as const),
    {
      title: isStr,
      notes: strOrNull,
      freq: isStr,
      weekdays: (v) => v === null || (Array.isArray(v) && v.every(isNum)),
      repeat_every: isNum,
      month_day: numOrNull,
      time_estimate_min: numOrNull,
      active_from: isStr,
      active_until: strOrNull,
      channel_id: strOrNull,
      paused: (v) => typeof v === "boolean",
    },
  );
}

// ---------------------------------------------------------------- the rest

export function pickSubtaskPatch(input: unknown): {
  title?: string;
  assignee_id?: string | null;
} {
  return typed(pick(input, ["title", "assignee_id"] as const), {
    title: isStr,
    assignee_id: strOrNull,
  });
}

export function pickObjectivePatch(input: unknown): {
  title?: string;
  status?: string;
  sort_order?: number;
} {
  return typed(pick(input, ["title", "status", "sort_order"] as const), {
    title: isStr,
    status: isStr,
    sort_order: isNum,
  });
}

export function pickObjectiveInput(input: unknown): {
  title?: string;
  period?: string;
  start_date?: string;
  end_date?: string;
} {
  return typed(pick(input, ["title", "period", "start_date", "end_date"] as const), {
    title: isStr,
    period: isStr,
    start_date: isStr,
    end_date: isStr,
  });
}

export function pickChannelPatch(input: unknown): { name?: string; color?: string } {
  return typed(pick(input, ["name", "color"] as const), { name: isStr, color: isStr });
}
