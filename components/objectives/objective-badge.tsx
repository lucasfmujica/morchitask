"use client";

import { Target } from "lucide-react";
import { useObjectives } from "@/lib/queries/objectives";

/** A compact "linked to objective" pill. Reads the cached objectives list and
 *  looks up by id, so it needs no prop drilling from task lists. */
export function ObjectiveBadge({ objectiveId }: { objectiveId: string }) {
  const objective = (useObjectives().data ?? []).find((o) => o.id === objectiveId);
  if (!objective) return null;

  return (
    <span
      className="inline-flex max-w-[10rem] items-center gap-1 text-[11px] font-medium text-muted"
      title={`Meta: ${objective.title}`}
    >
      <Target className="h-3 w-3 shrink-0" aria-hidden />
      <span className="truncate">{objective.title}</span>
    </span>
  );
}
