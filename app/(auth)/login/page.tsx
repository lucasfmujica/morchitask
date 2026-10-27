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
    <main className="relative grid min-h-dvh place-items-center overflow-hidden px-safe pt-safe pb-safe">
      {/* warm ambient glow */}
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(130% 90% at 50% -10%, var(--color-primary-soft), transparent 55%)",
        }}
        aria-hidden
      />

      <div className="w-full max-w-sm px-6">
        <div className="flex flex-col items-center gap-5 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="Morchitask" className="h-16 w-16 rounded-2xl shadow-card" />
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-extrabold tracking-tight text-fg">Morchitask</h1>
            <p className="text-balance text-muted">{t("tagline")}</p>
          </div>
        </div>

        <div className="mt-7 rounded-card border border-border bg-surface/70 p-5 shadow-soft backdrop-blur">
          <ul className="mb-5 flex flex-col gap-3">
            {FEATURES.map(({ icon: Icon, key }) => (
              <li key={key} className="flex items-center gap-3 text-sm text-fg">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                {t(key)}
              </li>
            ))}
          </ul>
          <LoginForm />
        </div>

        <p className="mt-5 text-center text-xs text-subtle">{t("googleNote")}</p>
      </div>
    </main>
  );
}
