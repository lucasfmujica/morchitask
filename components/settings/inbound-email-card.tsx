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
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <Mail className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden />
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold">{t("inboundTitle")}</p>
          <p className="text-xs text-muted">{t("inboundDesc")}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-pill bg-surface-2 py-1.5 pr-1.5 pl-4">
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
