"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.24 1.4-1.66 4.1-5.5 4.1a6.2 6.2 0 1 1 0-12.4c1.94 0 3.24.83 3.98 1.54l2.72-2.62C16.95 2.6 14.7 1.6 12 1.6a10.4 10.4 0 1 0 0 20.8c6 0 9.98-4.22 9.98-10.16 0-.68-.07-1.2-.16-1.72z"
      />
    </svg>
  );
}

export function LoginForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signInWithGoogle() {
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setError("No pudimos iniciar sesión. Intentá de nuevo.");
      setLoading(false);
    }
    // On success the browser is redirected to Google, so no further UI needed.
  }

  return (
    <div className="flex flex-col gap-3">
      <Button
        size="lg"
        variant="secondary"
        onClick={signInWithGoogle}
        disabled={loading}
        className="w-full border border-border bg-surface"
      >
        <GoogleIcon />
        {loading ? "Conectando…" : "Continuar con Google"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
