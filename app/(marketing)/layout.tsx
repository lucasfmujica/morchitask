import type { ReactNode } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

/**
 * Chrome for the pages a stranger reads.
 *
 * Deliberately not the app's shell: no sidebar, no command palette, no query
 * client. Someone who has not signed in has no data to fetch, and mounting the
 * app's providers here would ship the whole authenticated bundle to a landing
 * page — which is the one page where weight actually costs conversions.
 */
export default async function MarketingLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("marketing");

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="sticky top-0 z-20 border-b border-border bg-bg/85 backdrop-blur">
        <nav className="mx-auto flex h-16 w-full max-w-5xl items-center gap-3 px-5">
          <Link href="/" className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="Morchitask" className="h-8 w-8 rounded-xl shadow-soft" />
            <span className="text-base font-extrabold tracking-tight text-fg">Morchitask</span>
          </Link>

          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <Link
              href="/pricing"
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              {t("navPricing")}
            </Link>
            <Link
              href="/login"
              className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
            >
              {t("navSignIn")}
            </Link>
          </div>
        </nav>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-5 py-8 sm:flex-row sm:items-center">
          <div className="min-w-0">
            <p className="text-sm font-bold tracking-tight text-fg">Morchitask</p>
            <p className="text-xs text-muted">{t("footerTagline")}</p>
          </div>
          <nav className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted sm:ml-auto">
            <Link href="/pricing" className="transition-colors hover:text-fg">
              {t("footerPricing")}
            </Link>
            <Link href="/privacy" className="transition-colors hover:text-fg">
              {t("footerPrivacy")}
            </Link>
            <Link href="/terms" className="transition-colors hover:text-fg">
              {t("footerTerms")}
            </Link>
            <span className="text-subtle">{t("footerRights")}</span>
          </nav>
        </div>
      </footer>
    </div>
  );
}
