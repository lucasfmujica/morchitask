"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useHydrated } from "@/lib/use-hydrated";
import { cn } from "@/lib/utils";

/**
 * A native modal `<dialog>`: the browser gives it the focus trap (everything
 * outside goes inert), Escape, and the top layer for free. Mount it only while
 * open; unmounting is closing.
 *
 * Portalled to <body> on purpose. On a phone Hoy hides its Tareas or Agenda
 * well with display:none depending on the tab, and a dialog inside a hidden
 * well never draws even after showModal(): the replan panel used to live in
 * the agenda well, so "Reacomodar desde ahora" did nothing on the Tareas tab.
 */
export function ModalDialog({
  onClose,
  labelledBy,
  className,
  children,
}: {
  onClose: () => void;
  /** id of the heading that names the dialog. */
  labelledBy: string;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // /today?capture=1 mounts the capture sheet open on the first render, which
  // also runs on the server, where there is no <body> to portal into.
  const hydrated = useHydrated();
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const el = ref.current;
    if (!hydrated || !el) return;
    const before = document.activeElement as HTMLElement | null;
    // jsdom (tests) has no showModal; the open attribute is enough there.
    if (typeof el.showModal === "function") el.showModal();
    else el.setAttribute("open", "");
    // The page behind shouldn't scroll under a sheet you're reading.
    const html = document.documentElement;
    const prevOverflow = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = prevOverflow;
      // Removing an open dialog doesn't hand focus back like close() does.
      before?.focus?.();
    };
  }, [hydrated]);

  if (!hydrated) return null;
  return createPortal(
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      onCancel={(e) => {
        // Escape: let React own the unmount instead of the browser closing it.
        e.preventDefault();
        onCloseRef.current();
      }}
      onClick={(e) => {
        // The dialog box itself has no padding, so a click whose target is the
        // <dialog> landed on the backdrop.
        if (e.target === e.currentTarget) onCloseRef.current();
      }}
      className={cn(
        "animate-up p-0 backdrop:bg-scrim focus-visible:outline-none",
        // Phone: a bottom sheet. Desktop: centred card.
        "mx-0 mt-auto mb-0 max-h-[92dvh] w-full max-w-none overflow-y-auto overscroll-contain rounded-t-[28px] md:m-auto md:max-h-[calc(100dvh-48px)] md:rounded-[28px]",
        className,
      )}
    >
      {children}
    </dialog>,
    document.body,
  );
}
