import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LegalPage } from "../legal-page";
import { PRICE_MONTHLY_USD, PRICE_YEARLY_USD, TRIAL_DAYS } from "@/lib/pricing";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal");
  return { title: `${t("termsTitle")} · Morchitask`, description: t("termsIntro") };
}

export default async function TermsPage() {
  const t = await getTranslations("legal");

  return (
    <LegalPage
      title={t("termsTitle")}
      intro={t("termsIntro")}
      sections={[
        { heading: t("tS1Title"), body: t("tS1Body") },
        { heading: t("tS2Title"), body: t("tS2Body") },
        {
          heading: t("tS3Title"),
          body: t("tS3Body", {
            days: TRIAL_DAYS,
            price: PRICE_MONTHLY_USD,
            yearly: PRICE_YEARLY_USD,
          }),
        },
        { heading: t("tS4Title"), body: t("tS4Body") },
        { heading: t("tS5Title"), body: t("tS5Body") },
        { heading: t("tS6Title"), body: t("tS6Body") },
        { heading: t("tS7Title"), body: t("tS7Body") },
        { heading: t("tS8Title"), body: t("tS8Body") },
      ]}
    />
  );
}
