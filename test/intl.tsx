import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import es from "@/messages/es.json";
import { DEFAULT_LOCALE } from "@/lib/locale";

/**
 * Wraps a component under test in the same message context the app gives it.
 *
 * Deliberately the REAL `messages/es.json`, not a stub: these tests find
 * elements by the words on screen (`findByLabelText(/querés invitar/i)`), so a
 * fixture would let a component pass while showing something no user would
 * ever see. It also means a key deleted from the catalog fails a test here
 * rather than surfacing as "settings.title" in production.
 */
export function withIntl(ui: ReactNode) {
  return (
    <NextIntlClientProvider
      locale={DEFAULT_LOCALE}
      messages={es}
      timeZone="America/Argentina/Buenos_Aires"
    >
      {ui}
    </NextIntlClientProvider>
  );
}
