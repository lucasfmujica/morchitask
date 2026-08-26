"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { TOAST_DURATION_MS, useToastStore } from "@/lib/stores/toast";
import { EASE_OUT } from "@/lib/motion";
import { useTranslations } from "next-intl";

/**
 * The single toast slot, mounted once by the app chrome.
 *
 * Sits above the mobile bottom nav (`bottom-20`) so it never covers it, and
 * centres on desktop. `pointer-events-none` on the wrapper keeps the empty
 * area clickable — only the pill itself takes clicks.
 */
export function Toaster() {
  const t = useTranslations("common");
  const toast = useToastStore((s) => s.toast);
  const dismiss = useToastStore((s) => s.dismiss);

  useEffect(() => {
    if (!toast) return;
    const id = toast.id;
    const timer = setTimeout(() => dismiss(id), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [toast, dismiss]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center px-4 pb-safe md:bottom-6">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            role="status"
            aria-live="polite"
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98, transition: { duration: 0.14 } }}
            transition={{ duration: 0.24, ease: EASE_OUT }}
            className="pointer-events-auto flex max-w-full items-center gap-3 rounded-pill border border-border bg-surface py-2 pr-2 pl-4 shadow-pop"
          >
            <span className="truncate text-sm font-medium text-fg">{toast.message}</span>
            {toast.action && (
              <button
                onClick={() => {
                  toast.action!.run();
                  dismiss(toast.id);
                }}
                className="shrink-0 cursor-pointer rounded-pill bg-primary/12 px-3 py-1 text-xs font-bold text-primary transition-colors hover:bg-primary hover:text-on-primary focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
              >
                {toast.action.label}
              </button>
            )}
            <button
              onClick={() => dismiss(toast.id)}
              aria-label={t("dismissNotice")}
              className="shrink-0 cursor-pointer rounded-full p-1 text-subtle transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
