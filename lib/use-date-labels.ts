"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { createDateLabels, type DateLabels } from "@/lib/date-labels";
import { toLocale } from "@/lib/locale";

/**
 * The day-labelling functions, wired to the reader's language.
 *
 * Every place that turns a date into words is a client component, so the
 * locale can come from context here instead of being threaded down from the
 * server. Memoized because the labels object is rebuilt on each call and these
 * run inside lists that render often.
 */
export function useDateLabels(): DateLabels {
  const locale = useLocale();
  const t = useTranslations("common");

  return useMemo(
    () =>
      createDateLabels(toLocale(locale), {
        today: t("today"),
        tomorrow: t("tomorrow"),
        yesterday: t("yesterday"),
        todayLower: t("todayLower"),
        yesterdayLower: t("yesterdayLower"),
        daysAgo: (n) => t("daysAgo", { n }),
        monthsAgo: (n) => t("monthsAgo", { n }),
      }),
    [locale, t],
  );
}
