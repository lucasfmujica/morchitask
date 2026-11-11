"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { changeLocale } from "@/lib/actions/locale";
import { LOCALES, type Locale } from "@/lib/locale";
import { cn } from "@/lib/utils";

/**
 * The interface language, chosen the same way as the theme right above it.
 *
 * Each language is named in itself — "Español", not "Spanish" — because the
 * person most likely to come looking for this control is someone who landed in
 * a language they can't read, and a list translated into that language is no
 * help to them.
 *
 * Unlike the theme, this is not a browser preference: it writes
 * `profiles.locale` and then refreshes, because the server renders the
 * messages. That round trip is the reason for the pending state — otherwise
 * the button you pressed sits unlit for as long as the request takes.
 */
const LABEL_KEY: Record<Locale, string> = { es: "localeEs", en: "localeEn" };

export function LanguageSelector() {
  const t = useTranslations("settings");
  const current = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();

  function choose(locale: Locale) {
    if (locale === current) return;
    start(async () => {
      await changeLocale(locale);
      // The cookie decides what the server renders, so the new language only
      // appears once this tree is asked for again.
      router.refresh();
    });
  }

  return (
    <div className="grid grid-cols-2 gap-0.5 rounded-pill bg-border p-1">
      {LOCALES.map((locale) => {
        const active = locale === current;
        return (
          <button
            key={locale}
            onClick={() => choose(locale)}
            disabled={pending}
            aria-pressed={active}
            className={cn(
              "h-[38px] cursor-pointer rounded-pill px-3 text-sm font-semibold transition-colors duration-200 disabled:cursor-wait disabled:opacity-60",
              active ? "bg-surface text-fg shadow-soft" : "text-muted hover:text-fg",
            )}
          >
            {t(LABEL_KEY[locale])}
          </button>
        );
      })}
    </div>
  );
}
