import { CalendarCheck, Moon, Timer } from "lucide-react";
import { LoginForm } from "./login-form";
import { getTranslations } from "next-intl/server";

const FEATURES = [
  { icon: CalendarCheck, key: "featurePlan" },
  { icon: Timer, key: "featureFocus" },
  { icon: Moon, key: "featureShutdown" },
] as const;

export default async function LoginPage() {
  // A Server Component, so the translator is awaited rather than hooked.
  const t = await getTranslations("auth");
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-bg px-safe pt-safe pb-safe">
      {/* Green at the top fading into the paper: the same "it fits" green the
          app uses for a day that fits, so the first screen already speaks it. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[70dvh] bg-linear-to-b from-primary-soft to-bg"
        aria-hidden
      />

      <div className="relative w-full max-w-md px-6 py-10">
        <div className="flex flex-col items-center gap-5 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="Morchitask" className="h-16 w-16 rounded-2xl shadow-card" />
          <div className="flex flex-col gap-2">
            <h1 className="text-4xl font-bold tracking-tight text-fg">Morchitask</h1>
            <p className="text-balance text-muted">{t("tagline")}</p>
          </div>
        </div>

        <ul className="mt-7 flex flex-wrap justify-center gap-2">
          {FEATURES.map(({ icon: Icon, key }) => (
            <li
              key={key}
              className="flex items-center gap-2 rounded-pill bg-surface py-1.5 pr-3.5 pl-1.5 text-[13px] font-semibold text-fg shadow-soft"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-fit text-on-primary">
                <Icon className="h-3.5 w-3.5" aria-hidden />
              </span>
              {t(key)}
            </li>
          ))}
        </ul>

        <div className="mt-9">
          <LoginForm />
        </div>

        <p className="mx-auto mt-4 max-w-xs text-center text-xs text-muted">{t("googleNote")}</p>
      </div>
    </main>
  );
}
