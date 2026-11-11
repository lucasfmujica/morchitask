"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui";
import { useTranslations } from "next-intl";

export function LoginForm() {
  const t = useTranslations("auth");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signInWithGoogle() {
    setError(null);
    setLoading(true);
    try {
      await signIn("google", { redirectTo: "/today" });
      // On success the browser is redirected to Google, so no further UI needed.
    } catch {
      setError(t("signInFailed"));
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      {/* The main action is an ink pill like every other one in the app, at
          its largest here because it is the only thing on the screen to do.
          The green glow that breathes under it is the "it fits" green, not a
          brand blue; the top of the pill is lifted a step so it reads as
          pressable rather than a flat slab of ink. */}
      <Button
        size="lg"
        onClick={signInWithGoogle}
        disabled={loading}
        className="h-14 animate-glow gap-2.5 bg-linear-to-b from-[color-mix(in_srgb,var(--color-fg)_94%,var(--color-surface))] to-fg px-8 text-[15px] text-surface"
      >
        {loading ? t("connecting") : t("continueWithGoogle")}
        <svg
          width="15"
          height="15"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M2.5 8h10M9 4.5 12.5 8 9 11.5" />
        </svg>
      </Button>
      {error && (
        <p role="alert" className="text-center text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
