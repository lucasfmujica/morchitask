"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { addDays, addMonths, todayISO } from "@/lib/date";
import { useCommandPalette } from "@/lib/stores/command-palette";

const DATE_RE = /(\d{4}-\d{2}-\d{2})/;

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["⌘", "K"], label: "Buscar / acción rápida" },
  { keys: ["N"], label: "Nueva tarea" },
  { keys: ["←", "→"], label: "Día / semana / mes anterior y siguiente" },
  { keys: ["T"], label: "Ir a hoy" },
  { keys: ["?"], label: "Mostrar / ocultar esta ayuda" },
];

/** Global keyboard shortcuts (mounted once in the app shell). */
export function KeyboardShortcuts() {
  const pathname = usePathname();
  const router = useRouter();
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Cmd/Ctrl+K toggles the command palette from anywhere (even while typing).
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        useCommandPalette.getState().toggle();
        return;
      }

      const el = e.target as HTMLElement | null;
      const typing =
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable);
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "Escape") {
        setShowHelp(false);
        return;
      }
      if (e.key === "?") {
        e.preventDefault();
        setShowHelp((s) => !s);
        return;
      }
      if (e.key === "n") {
        const input = document.querySelector<HTMLInputElement>("[data-task-composer]");
        if (input) {
          e.preventDefault();
          input.scrollIntoView({ block: "center", behavior: "smooth" });
          input.focus();
        }
        return;
      }
      if (e.key === "t") {
        router.push("/today");
        return;
      }

      // Arrow navigation, scoped to the current view (day / week / month).
      const dir = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
      if (!dir) return;
      const cur = pathname.match(DATE_RE)?.[1] ?? todayISO();
      if (pathname.startsWith("/week")) {
        e.preventDefault();
        router.push(`/week/${addDays(cur, dir * 7)}`);
      } else if (pathname.startsWith("/month")) {
        e.preventDefault();
        router.push(`/month/${addMonths(cur, dir)}`);
      } else if (pathname === "/today" || pathname.startsWith("/day")) {
        e.preventDefault();
        const next = addDays(cur, dir);
        router.push(next === todayISO() ? "/today" : `/day/${next}`);
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pathname, router]);

  return (
    <AnimatePresence>
      {showHelp && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/40 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setShowHelp(false)}
        >
          <motion.div
            className="w-full max-w-sm rounded-card border border-border bg-surface p-5 shadow-card"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Atajos de teclado"
          >
            <h2 className="mb-3 text-sm font-bold tracking-tight text-fg">Atajos de teclado</h2>
            <ul className="flex flex-col gap-2.5">
              {SHORTCUTS.map((s) => (
                <li key={s.label} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-muted">{s.label}</span>
                  <span className="flex shrink-0 gap-1">
                    {s.keys.map((k) => (
                      <kbd
                        key={k}
                        className="min-w-[22px] rounded border border-border bg-surface-2 px-1.5 py-0.5 text-center font-sans text-[11px] font-semibold text-fg"
                      >
                        {k}
                      </kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
