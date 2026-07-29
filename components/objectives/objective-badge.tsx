"use client";

import { Target } from "lucide-react";
import { useObjectives } from "@/lib/queries/objectives";

/** A compact "linked to objective" pill. Reads the cached objectives list and
 *  looks up by id, so it needs no prop drilling from task lists.
 *
 *  `iconOnly` drops the title for narrow contexts (week columns) — the name
 *  stays reachable through the tooltip. */
export function ObjectiveBadge({
  objectiveId,
  iconOnly = false,
}: {
  objectiveId: string;
  iconOnly?: boolean;
}) {
  const objective = (useObjectives().data ?? []).find((o) => o.id === objectiveId);
  if (!objective) return null;

  return (
    <span
      className="inline-flex max-w-[10rem] items-center gap-1 text-2xs font-medium text-muted"
      title={`Meta: ${objective.title}`}
      aria-label={iconOnly ? `Meta: ${objective.title}` : undefined}
    >
      <Target className="h-3 w-3 shrink-0" aria-hidden />
      {!iconOnly && <span className="truncate">{objective.title}</span>}
    </span>
  );
}
