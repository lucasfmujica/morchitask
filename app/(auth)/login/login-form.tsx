"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
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
          The green halo under it is the "it fits" green, not a brand blue. */}
      <Button
        size="lg"
        onClick={signInWithGoogle}
        disabled={loading}
        className="h-14 gap-2.5 px-8 text-[15px] shadow-lg shadow-primary/30"
      >
        {loading ? t("connecting") : t("continueWithGoogle")}
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Button>
      {error && (
        <p role="alert" className="text-center text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
