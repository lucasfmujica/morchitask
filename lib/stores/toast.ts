import { create } from "zustand";

/**
 * Minimal toast queue: a message, an optional single action (almost always
 * "Deshacer") and a timeout. Deliberately tiny — the redesign needs feedback
 * with an undo affordance for optimistic mutations, not a notification system.
 *
 * One toast at a time: showing a second replaces the first. Two stacked
 * "Deshacer" buttons is a worse affordance than one that always means "the
 * thing you just did".
 */
export const TOAST_DURATION_MS = 4200;

export type Toast = {
  id: number;
  message: string;
  action?: { label: string; run: () => void };
};

type ToastState = {
  toast: Toast | null;
  show: (message: string, action?: Toast["action"]) => void;
  dismiss: (id?: number) => void;
  /** "Didn't save", in the current language. Set by the mounted `Toaster`,
   *  which has the translations; the query client that reports failed
   *  mutations sits above every message provider and has none. Null while no
   *  toaster is mounted, and then there is nowhere to show it anyway. */
  saveFailedMessage: string | null;
};

let nextId = 1;

export const useToastStore = create<ToastState>((set, get) => ({
  toast: null,
  saveFailedMessage: null,
  show: (message, action) => set({ toast: { id: nextId++, message, action } }),
  // An id makes the auto-dismiss timer safe: a stale timeout can't close the
  // toast that replaced the one it was scheduled for.
  dismiss: (id) => {
    const current = get().toast;
    if (!current) return;
    if (id != null && current.id !== id) return;
    set({ toast: null });
  },
}));

/** `const toast = useToast(); toast("Listo", { label: "Deshacer", run })` */
export function useToast() {
  return useToastStore((s) => s.show);
}

/** Shows "didn't save", for the query client's global mutation error handler. */
export function showSaveFailed() {
  const { saveFailedMessage, show } = useToastStore.getState();
  if (saveFailedMessage) show(saveFailedMessage);
}
