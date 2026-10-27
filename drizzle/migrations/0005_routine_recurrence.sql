ALTER TABLE "recurring_templates" ADD COLUMN "repeat_every" smallint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "recurring_templates" ADD COLUMN "month_day" smallint;--> statement-breakpoint
ALTER TABLE "recurring_templates" ADD CONSTRAINT "recurring_freq_check" CHECK ("recurring_templates"."freq" in ('daily', 'weekly', 'monthly'));--> statement-breakpoint
ALTER TABLE "recurring_templates" ADD CONSTRAINT "recurring_repeat_every_check" CHECK ("recurring_templates"."repeat_every" between 1 and 52);--> statement-breakpoint
ALTER TABLE "recurring_templates" ADD CONSTRAINT "recurring_month_day_check" CHECK ("recurring_templates"."month_day" is null or "recurring_templates"."month_day" between 1 and 31);--> statement-breakpoint
-- Same contract as 0001 (idempotent via tasks_template_day_unique), now with
-- "every N" and monthly routines. Mirrors isExpectedOccurrence in
-- lib/streaks.ts — keep both in sync.
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
  dom int;
  last_dom int;
begin
  dow := extract(isodow from target_date);
  dom := extract(day from target_date);
  last_dom := extract(day from (date_trunc('month', target_date) + interval '1 month - 1 day'));

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
    and (
      (t.freq = 'daily'
        and (target_date - t.active_from) % t.repeat_every = 0)
      or (t.freq = 'weekly'
        and dow = any(t.weekdays)
        and ((date_trunc('week', target_date)::date - date_trunc('week', t.active_from)::date) / 7)
            % t.repeat_every = 0)
      or (t.freq = 'monthly'
        and dom = least(coalesce(t.month_day, extract(day from t.active_from)::int), last_dom)
        and ((extract(year from target_date) - extract(year from t.active_from)) * 12
             + extract(month from target_date) - extract(month from t.active_from))::int
            % t.repeat_every = 0)
    )
  on conflict (template_id, template_date) do nothing;
end;
$function$;
