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
    // Its own well, so it sits in the settings bento like every other group.
    <div className="rounded-2xl bg-surface-2 p-2">
      <div className="flex flex-col gap-3 rounded-xl bg-surface p-3.5 shadow-soft">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
            <Mail className="h-[18px] w-[18px]" aria-hidden />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-sm font-semibold text-fg">{t("inboundTitle")}</p>
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
    </div>
  );
}
