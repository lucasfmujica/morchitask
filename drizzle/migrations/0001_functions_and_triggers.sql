-- Ported from Supabase (bodkrhcmzdvbeqipsqzx). Two changes from the source:
--   1. RLS/SECURITY DEFINER dropped — the app enforces household/owner scoping
--      itself now (see migration plan).
--   2. ensure_day_materialized / rollover_incomplete take household_id / owner_id
--      as explicit parameters instead of reading them from `auth.uid()` /
--      `app_private.current_household_id()`, since Neon has no per-request
--      session context. Callers: lib/db/queries/routines.ts, daily-notes.ts.

CREATE SCHEMA IF NOT EXISTS app_private;

-- Keeps tasks.block_start/block_end mirroring the task's earliest time-block,
-- so day/week views can show a task's schedule without joining task_blocks.
CREATE OR REPLACE FUNCTION app_private.sync_task_primary_block()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
declare
  v_task_id uuid := coalesce(new.task_id, old.task_id);
  v_start timestamptz;
  v_end timestamptz;
begin
  select b.start_at, b.end_at into v_start, v_end
  from public.task_blocks b
  where b.task_id = v_task_id
  order by b.start_at asc
  limit 1;

  update public.tasks
  set block_start = v_start, block_end = v_end
  where id = v_task_id;

  return null;
end;
$function$;

CREATE TRIGGER task_blocks_sync_primary
AFTER INSERT OR UPDATE OR DELETE ON public.task_blocks
FOR EACH ROW EXECUTE FUNCTION app_private.sync_task_primary_block();

-- Generates today's routine instances (idempotent — relies on the
-- tasks_template_day_unique constraint). Called once per day per household.
CREATE OR REPLACE FUNCTION public.ensure_day_materialized(
  target_date date,
  p_household_id uuid,
  p_owner_id uuid
)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
declare
  dow int;
begin
  dow := extract(isodow from target_date);

  insert into public.tasks (
    household_id, owner_id, channel_id, title, notes, time_estimate_min,
    planned_date, template_id, template_date, sort_order, created_by
  )
  select t.household_id, t.owner_id, t.channel_id, t.title, t.notes, t.time_estimate_min,
         target_date, t.id, target_date, 1000, t.owner_id
  from public.recurring_templates t
  where t.household_id = p_household_id
    and t.owner_id = p_owner_id
    and not t.paused
    and t.active_from <= target_date
    and (t.active_until is null or t.active_until >= target_date)
    and (t.freq = 'daily' or (t.freq = 'weekly' and dow = any(t.weekdays)))
  on conflict (template_id, template_date) do nothing;
end;
$function$;

-- Moves the caller's unfinished (non-routine) tasks from one day to another.
-- Returns the number of tasks moved.
CREATE OR REPLACE FUNCTION public.rollover_incomplete(
  p_owner_id uuid,
  from_date date,
  to_date date
)
RETURNS integer
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
declare moved int;
begin
  update public.tasks
  set planned_date = to_date,
      rollover_count = rollover_count + 1,
      rollover_origin_date = coalesce(rollover_origin_date, from_date),
      block_start = null,
      block_end = null
  where owner_id = p_owner_id
    and planned_date = from_date
    and status = 'todo'
    and template_id is null; -- routine instances are not rolled
  get diagnostics moved = row_count;
  return moved;
end;
$function$;
