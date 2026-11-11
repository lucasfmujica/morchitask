import { Check } from "lucide-react";
import { LoginForm } from "./login-form";
import { getTranslations } from "next-intl/server";

const FEATURES = ["featurePlan", "featureFocus", "featureShutdown"] as const;

// The ring's circumference at r=96, so the arc can be drawn by dash offset.
const RING_C = 2 * Math.PI * 96;

/* Keyframes local to this page: the halo and the ring that fills and empties
   are the whole of its motion, and nothing else in the app uses them. The
   reduced-motion guard sits here too so the ring simply rests at three
   quarters for anyone who asked the system for stillness. */
const MOTION = `
@keyframes login-halo{0%{transform:scale(.85);opacity:.7}100%{transform:scale(1.3);opacity:0}}
@keyframes login-ring{0%{stroke-dashoffset:${RING_C}}55%,80%{stroke-dashoffset:${RING_C * 0.25}}100%{stroke-dashoffset:${RING_C}}}
@keyframes login-up{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
.login-halo{animation:login-halo 3s ease-out infinite}
.login-ring{animation:login-ring 6s cubic-bezier(.6,0,.2,1) infinite}
.login-up{animation:login-up .8s cubic-bezier(.2,.8,.2,1) both}
@media (prefers-reduced-motion:reduce){.login-halo,.login-ring,.login-up{animation:none}}
`;

export default async function LoginPage() {
  // A Server Component, so the translator is awaited rather than hooked.
  const t = await getTranslations("auth");
  return (
    <main className="min-h-dvh bg-linear-to-b from-fit-from/30 via-primary-soft via-35% to-bg to-70% px-safe pt-safe pb-safe text-fg">
      <style>{MOTION}</style>
      <div className="flex flex-col items-center px-5 py-12">
        <span className="login-up font-display text-xl font-bold tracking-tight">Morchitask</span>

        {/* The day-capacity ring the app opens on, filling and emptying: the
            first screen shows the thing you will look at every morning. Pure
            decoration, so screen readers skip straight to the headline. */}
        <div className="relative mt-14 h-[230px] w-[230px] shrink-0" aria-hidden>
          <span className="login-halo absolute inset-0 rounded-full border-[1.5px] border-surface" />
          <span className="login-halo absolute inset-0 rounded-full border-[1.5px] border-surface [animation-delay:1.5s]" />
          <svg width="230" height="230" viewBox="0 0 230 230" className="relative -rotate-90">
            <defs>
              <linearGradient id="login-ring-fill" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="var(--fit-from)" stopOpacity="0.55" />
                <stop offset="1" stopColor="var(--primary)" />
              </linearGradient>
            </defs>
            <circle
              cx="115"
              cy="115"
              r="96"
              fill="var(--surface)"
              stroke="var(--surface-2)"
              strokeWidth="16"
            />
            <circle
              className="login-ring"
              cx="115"
              cy="115"
              r="96"
              fill="none"
              stroke="url(#login-ring-fill)"
              strokeWidth="16"
              strokeLinecap="round"
              strokeDasharray={RING_C}
              strokeDashoffset={RING_C * 0.25}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
            <span className="font-display text-[38px] leading-none font-bold tracking-tight tabular-nums">
              {t("ringTime")}
            </span>
            <span className="text-[13px] font-semibold text-primary">{t("ringLabel")}</span>
          </div>
        </div>

        <h1 className="login-up mt-10 max-w-[520px] text-center font-display text-[32px] leading-9 font-bold tracking-tight text-balance [animation-delay:200ms] sm:text-[40px] sm:leading-[44px]">
          {t("tagline")}
        </h1>

        <ul className="login-up mt-7 flex flex-wrap justify-center gap-2 [animation-delay:400ms]">
          {FEATURES.map((key) => (
            <li
              key={key}
              className="flex items-center gap-2 rounded-pill bg-surface py-2 pr-3.5 pl-2 text-[13px] font-semibold"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-fit text-on-primary">
                <Check className="h-2.5 w-2.5" strokeWidth={3.5} aria-hidden />
              </span>
              {t(key)}
            </li>
          ))}
        </ul>

        <div className="login-up mt-9 [animation-delay:700ms]">
          <LoginForm />
        </div>

        <p className="login-up mt-4 max-w-[360px] text-center text-[13px] leading-[19px] text-muted [animation-delay:900ms]">
          {t("googleNote")}
        </p>
      </div>
    </main>
  );
}
