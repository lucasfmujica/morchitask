import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LegalPage } from "../legal-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal");
  return { title: `${t("privacyTitle")} · Morchitask`, description: t("privacyIntro") };
}

export default async function PrivacyPage() {
  const t = await getTranslations("legal");

  return (
    <LegalPage
      title={t("privacyTitle")}
      intro={t("privacyIntro")}
      sections={[
        { heading: t("pS1Title"), body: t("pS1Body") },
        { heading: t("pS2Title"), body: t("pS2Body") },
        { heading: t("pS3Title"), body: t("pS3Body") },
        { heading: t("pS4Title"), body: t("pS4Body") },
        { heading: t("pS5Title"), body: t("pS5Body") },
        { heading: t("pS6Title"), body: t("pS6Body") },
      ]}
    />
  );
}
