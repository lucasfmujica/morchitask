"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import { getInboundAddress } from "@/lib/actions/inbound";
import { Button } from "@/components/ui/button";

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
      <div className="flex items-center gap-2 rounded-pill bg-surface-2 py-1 pr-1 pl-4">
        <span className="min-w-0 flex-1 truncate font-mono text-xs">{address}</span>
        <Button
          size="sm"
          variant={copied ? "secondary" : "primary"}
          onClick={() => {
            navigator.clipboard?.writeText(address).then(
              () => setCopied(true),
              () => {},
            );
          }}
        >
          {copied ? t("inboundCopied") : t("inboundCopy")}
        </Button>
      </div>
    </div>
  );
}
