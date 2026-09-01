"use client";

import { useTranslations } from "next-intl";
import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

export function SignOutButton() {
  const t = useTranslations("common");

  return (
    <button
      onClick={() => signOut({ redirectTo: "/login" })}
      aria-label={t("signOut")}
      className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg"
    >
      <LogOut className="h-[18px] w-[18px]" aria-hidden />
    </button>
  );
}
