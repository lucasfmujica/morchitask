import type { ReactNode } from "react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { NextIntlClientProvider } from "next-intl";
import { PUBLIC_NAMESPACES, pickMessages } from "@/lib/i18n-messages";
import { LogoMark } from "@/components/marketing/icons";
import { localizedPath } from "@/lib/seo";

/**
 * Chrome for the pages a stranger reads.
 *
 * Deliberately not the app's shell: no sidebar, no command palette, no query
 * client. Someone who has not signed in has no data to fetch, and mounting the
 * app's providers here would ship the whole authenticated bundle to a landing
 * page, which is the one page where weight actually costs conversions.
 *
 * The nav borrows the app's segmented pill instead of a marketing navbar, so
 * the first thing a visitor sees is already the product's chrome.
 */
export default async function MarketingLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("marketing");
  const locale = await getLocale();
  // The landing's client parts (the ritual player) read the marketing
  // namespace, so the provider carries the public namespaces.
  const messages = await pickMessages(PUBLIC_NAMESPACES);

  // Section anchors live on the home page of each language; from /pricing or
  // /privacy they have to point back there rather than at a missing #id.
  const home = locale === "en" ? "/en" : "/";
  const anchor = (id: string) => (home === "/" ? `/#${id}` : `${home}#${id}`);
  const other = locale === "en" ? { href: "/", lang: "es" } : { href: "/en", lang: "en" };
  // On /en every link stays in English; the unprefixed URLs are the Spanish ones.
  const lang = locale === "en" ? "en" : "es";
  const path = (p: "/pricing" | "/privacy" | "/terms") => localizedPath(p, lang);

  const pill =
    "flex h-9 items-center rounded-pill px-4 text-muted transition-colors hover:bg-surface hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";
  const footerLink = "text-muted transition-colors hover:text-primary";

  return (
    <NextIntlClientProvider messages={messages}>
      <div data-marketing className="flex min-h-dvh flex-col bg-bg text-fg">
        <header className="mx-auto flex w-full max-w-[1280px] items-center gap-4 px-4 py-5 min-[900px]:px-8">
          <Link
            href={home}
            aria-label={t("nav.home")}
            className="flex items-center gap-2.5 font-display text-xl font-semibold tracking-[-0.01em] text-fg"
          >
            <LogoMark />
            Morchitask
          </Link>
          <nav
            aria-label={t("nav.label")}
            className="mx-auto hidden gap-0.5 rounded-pill bg-surface-2 p-1 text-sm font-semibold min-[900px]:flex"
          >
            <Link href={anchor("como")} className={pill}>
              {t("nav.how")}
            </Link>
            <Link href={path("/pricing")} className={pill}>
              {t("nav.pricing")}
            </Link>
            <Link href={anchor("honesto")} className={pill}>
              {t("nav.honest")}
            </Link>
          </nav>
          <Link
            href="/login"
            className="ml-auto text-sm font-semibold text-fg transition-colors hover:text-primary min-[900px]:ml-0"
          >
            {t("nav.signIn")}
          </Link>
          <Link
            href="/login"
            className="flex h-10 items-center rounded-pill bg-fg px-[18px] text-sm font-semibold whitespace-nowrap text-bg transition-colors hover:bg-fg/85"
          >
            {t("nav.try")}
          </Link>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="mx-auto flex w-full max-w-[1280px] flex-wrap items-start gap-x-12 gap-y-6 px-4 pt-6 pb-12 text-sm text-muted min-[900px]:px-8">
          <div className="flex flex-[1_1_260px] flex-col gap-2">
            <span className="font-display text-lg font-semibold text-fg">Morchitask</span>
            <span>{t("footer.tagline")}</span>
          </div>
          <nav
            aria-label={t("footer.label")}
            className="flex flex-wrap gap-x-6 gap-y-2 min-[900px]:pt-1"
          >
            <Link href={path("/pricing")} className={footerLink}>
              {t("footer.pricing")}
            </Link>
            <Link href={path("/privacy")} className={footerLink}>
              {t("footer.privacy")}
            </Link>
            <Link href={path("/terms")} className={footerLink}>
              {t("footer.terms")}
            </Link>
            <Link href={other.href} lang={other.lang} hrefLang={other.lang} className={footerLink}>
              {t("footer.otherLanguage")}
            </Link>
          </nav>
        </footer>
      </div>
    </NextIntlClientProvider>
  );
}
