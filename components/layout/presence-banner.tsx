"use client";

import { useMe, useProfiles } from "@/lib/queries/profiles";
import { usePartnerPresence } from "@/lib/queries/presence";
import { OwnerAvatar } from "@/components/tasks/owner-avatar";

/**
 * A thin live bar: "Sofi está en: <task>" when the partner has a shared task's
 * timer running. Hidden otherwise. Sits above the page content.
 */
export function PresenceBanner() {
  const me = useMe().data;
  const profiles = useProfiles().data ?? [];
  const { data: task } = usePartnerPresence(me?.id);

  if (!task) return null;
  const partner = profiles.find((p) => p.id === task.owner_id);

  return (
    <div className="flex items-center gap-2 border-b border-border bg-primary-soft/60 px-safe py-1.5 text-xs text-primary md:px-8">
      <span className="flex items-center gap-1.5">
        <OwnerAvatar profile={partner} size={18} />
        <span className="font-semibold">{partner?.display_name ?? "Tu compa"}</span>
      </span>
      <span className="min-w-0 truncate text-fg/80">
        está en <span className="font-medium text-fg">{task.title}</span>
      </span>
      <span className="ml-auto shrink-0 animate-pulse text-primary" aria-hidden>
        ●
      </span>
    </div>
  );
}
