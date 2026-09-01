"use client";

import { useMe, useProfiles } from "@/lib/queries/profiles";
import { usePartnerPresence } from "@/lib/queries/presence";
import { OwnerAvatar } from "@/components/tasks/owner-avatar";
import { useTranslations } from "next-intl";

/**
 * A thin live bar: "Sofi está en: <task>" when the partner has a shared task's
 * timer running. They can be timing more than one, so the newest is named and
 * the rest are counted. Hidden when nothing is running. Sits above the page.
 */
export function PresenceBanner() {
  const t = useTranslations("presence");
  const me = useMe().data;
  const profiles = useProfiles().data ?? [];
  const { data: active } = usePartnerPresence(me?.id);

  const task = active?.[0];
  if (!task) return null;
  const others = (active?.length ?? 0) - 1;
  const partner = profiles.find((p) => p.id === task.owner_id);

  return (
    <div className="flex items-center gap-2 border-b border-border bg-primary-soft/60 px-safe py-1.5 text-xs text-primary md:px-8">
      <span className="flex items-center gap-1.5">
        <OwnerAvatar profile={partner} size={18} />
        <span className="font-semibold">{partner?.display_name ?? t("fallbackName")}</span>
      </span>
      <span className="min-w-0 truncate text-fg/80">
        {/* One message, not "está en" + the title glued together: word order
            differs between languages, so the sentence has to stay whole. */}
        {t.rich("working", {
          title: task.title,
          task: (chunks) => <span className="font-medium text-fg">{chunks}</span>,
        })}
        {others > 0 && <span className="text-fg/60"> {t("andMore", { n: others })}</span>}
      </span>
      <span className="ml-auto shrink-0 animate-pulse text-primary" aria-hidden>
        ●
      </span>
    </div>
  );
}
