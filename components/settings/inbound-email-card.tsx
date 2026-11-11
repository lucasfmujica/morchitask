"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import { getInboundAddress } from "@/lib/actions/inbound";
import { cn } from "@/lib/utils";

/**
 * Your private address for forwarding mail into the backlog. Hidden entirely
 * while the server isn't configured for it, so nobody copies an address that
 * goes nowhere.
 */
export function InboundEmailCard() {
  const t = useTranslations("settings");
  const q = useQuery({ queryKey: ["inbound-address"], queryFn: () => getInboundAddress() });
  const [copied, setCopied] = useState(false);
  const address = q.data;
  if (!address) return null;

  return (
    // A card, not a well: it sits in Integraciones beside Calendar and
    // Spotify, since it is one more way for things to come in from outside.
    <div className="flex flex-col gap-2.5 rounded-[18px] bg-surface p-3.5">
      <div className="flex items-center gap-2.5">
        <Mail className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
        <p className="min-w-0 flex-1 text-sm font-semibold text-fg">{t("inboundTitle")}</p>
      </div>
      <p className="text-2xs leading-[17px] text-muted">{t("inboundDesc")}</p>
      {/* The address pill and its copy button as the Captura canvas draws
          them; the card shell stays the Integraciones one, like its siblings. */}
      <div className="flex items-center gap-2 rounded-pill bg-bg py-1.5 pr-1.5 pl-4">
        <span className="min-w-0 flex-1 truncate font-mono text-xs">{address}</span>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(address).then(
              () => setCopied(true),
              () => {},
            );
          }}
          className={cn(
            "h-[34px] shrink-0 cursor-pointer rounded-pill px-3.5 text-2xs font-semibold transition-[background] duration-200 focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none",
            copied ? "bg-primary-soft text-primary" : "bg-fg text-surface hover:opacity-90",
          )}
        >
          {copied ? t("inboundCopied") : t("inboundCopy")}
        </button>
      </div>
    </div>
  );
}
