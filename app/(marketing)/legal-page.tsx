import { AlertTriangle } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { LEGAL_CONTACT_EMAIL, LEGAL_UPDATED } from "@/lib/legal";

/**
 * Shared shell for the privacy policy and the terms.
 *
 * The two pages differ only in their sections, so the chrome — heading, date,
 * contact, prose rhythm — lives here rather than being copied and then drifting
 * apart, which is exactly how one of them ends up with a stale date.
 */
export async function LegalPage({
  title,
  intro,
  sections,
}: {
  title: string;
  intro: string;
  sections: { heading: string; body: string }[];
}) {
  const t = await getTranslations("legal");

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-16 sm:py-20">
      <h1 className="text-3xl font-extrabold tracking-tight text-fg sm:text-4xl">{title}</h1>
      <p className="mt-2 text-sm text-subtle">{t("updated", { date: LEGAL_UPDATED })}</p>
      <p className="mt-5 text-balance text-lg text-muted">{intro}</p>

      {/* Said out loud rather than buried: these are a starting point, not
          advice, and shipping them as if a lawyer had signed off would be the
          dishonest move. */}
      <p className="mt-6 flex items-start gap-2.5 rounded-2xl bg-accent-soft p-4 text-sm text-fg ring-1 ring-warning/30">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
        <span>{t("draftNotice")}</span>
      </p>

      <div className="mt-10 flex flex-col gap-8">
        {sections.map(({ heading, body }) => (
          <section key={heading}>
            <h2 className="text-lg font-bold tracking-tight text-fg">{heading}</h2>
            <p className="mt-2 text-balance leading-relaxed text-muted">{body}</p>
          </section>
        ))}
      </div>

      <p className="mt-12 border-t border-border pt-6 text-sm text-muted">
        {t("contactLabel")}{" "}
        <a
          href={`mailto:${LEGAL_CONTACT_EMAIL}`}
          className="font-medium text-primary transition-colors hover:underline"
        >
          {LEGAL_CONTACT_EMAIL}
        </a>
      </p>
    </div>
  );
}
