import { create } from "zustand";
import type { Task } from "@/lib/queries/types";

/** Which task (if any) is open in the detail sheet. */
type TaskDetailState = {
  openTask: Task | null;
  open: (task: Task) => void;
  close: () => void;
};

export const useTaskDetail = create<TaskDetailState>((set) => ({
  openTask: null,
  open: (task) => set({ openTask: task }),
  close: () => set({ openTask: null }),
}));
