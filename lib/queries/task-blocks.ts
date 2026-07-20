import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createBlock as createBlockAction,
  deleteBlock as deleteBlockAction,
  getBlocksForDate,
  updateBlock as updateBlockAction,
} from "@/lib/actions/task-blocks";
import { taskKeys } from "./tasks";
import type { TaskBlock } from "./types";

export const blockKeys = {
  /** All blocks for tasks planned on a given day, grouped by task id. */
  date: (date: string) => ["blocks", "date", date] as const,
};

/** Group a flat list of blocks by parent task id. Pure. */
export function groupBlocksByTask(blocks: TaskBlock[]): Map<string, TaskBlock[]> {
  const map = new Map<string, TaskBlock[]>();
  for (const b of blocks) {
    const arr = map.get(b.task_id);
    if (arr) arr.push(b);
    else map.set(b.task_id, [b]);
  }
  return map;
}

/**
 * One query per day returning every time-block for that day's tasks, grouped by
 * task id (a task can have several). Joins by the task's planned_date so it
 * stays scoped to the same day as the tasks/subtasks queries.
 */
export function blocksForDateQueryOptions(date: string) {
  return {
    queryKey: blockKeys.date(date),
    queryFn: async (): Promise<Map<string, TaskBlock[]>> => {
      const rows = await getBlocksForDate(date);
      return groupBlocksByTask(rows);
    },
  };
}

export function useBlocksForDate(date: string) {
  return useQuery(blocksForDateQueryOptions(date));
}

// ------------------------------------------------------------ mutations

type BlockCache = Map<string, TaskBlock[]>;

function setBlockInCache(
  qc: ReturnType<typeof useQueryClient>,
  date: string,
  fn: (m: BlockCache) => BlockCache,
) {
  qc.setQueryData<BlockCache>(blockKeys.date(date), (old) => fn(new Map(old ?? new Map())));
}

function settleKeys(qc: ReturnType<typeof useQueryClient>, date: string) {
  // Blocks changed; tasks.block_start/end also moved via the DB mirror trigger.
  qc.invalidateQueries({ queryKey: blockKeys.date(date) });
  qc.invalidateQueries({ queryKey: taskKeys.date(date) });
}

/** Create a new block for a task at a given instant range. Returns the row. */
export function useCreateBlock(date: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { taskId: string; startISO: string; endISO: string }): Promise<TaskBlock> =>
      createBlockAction(input.taskId, input.startISO, input.endISO),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: blockKeys.date(date) });
      const prev = qc.getQueryData<BlockCache>(blockKeys.date(date));
      const temp = {
        id: `temp-${crypto.randomUUID()}`,
        task_id: input.taskId,
        start_at: input.startISO,
        end_at: input.endISO,
        gcal_event_id: null,
        gcal_synced_at: null,
        household_id: "",
        created_at: new Date().toISOString(),
      } as TaskBlock;
      setBlockInCache(qc, date, (m) => {
        m.set(input.taskId, [...(m.get(input.taskId) ?? []), temp]);
        return m;
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(blockKeys.date(date), ctx.prev);
    },
    onSettled: () => settleKeys(qc, date),
  });
}

/** Move/resize a block (new start and/or end instants). Returns the row. */
export function useUpdateBlock(date: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      block: TaskBlock;
      startISO: string;
      endISO: string;
    }): Promise<TaskBlock> => updateBlockAction(input.block.id, input.startISO, input.endISO),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: blockKeys.date(date) });
      const prev = qc.getQueryData<BlockCache>(blockKeys.date(date));
      setBlockInCache(qc, date, (m) => {
        const arr = m.get(input.block.task_id);
        if (arr) {
          m.set(
            input.block.task_id,
            arr.map((b) =>
              b.id === input.block.id
                ? { ...b, start_at: input.startISO, end_at: input.endISO }
                : b,
            ),
          );
        }
        return m;
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(blockKeys.date(date), ctx.prev);
    },
    onSettled: () => settleKeys(qc, date),
  });
}

/** Delete a block (removing that one calendar session). */
export function useDeleteBlock(date: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (block: TaskBlock): Promise<void> => deleteBlockAction(block.id),
    onMutate: async (block) => {
      await qc.cancelQueries({ queryKey: blockKeys.date(date) });
      const prev = qc.getQueryData<BlockCache>(blockKeys.date(date));
      setBlockInCache(qc, date, (m) => {
        const arr = m.get(block.task_id);
        if (arr)
          m.set(
            block.task_id,
            arr.filter((b) => b.id !== block.id),
          );
        return m;
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(blockKeys.date(date), ctx.prev);
    },
    onSettled: () => settleKeys(qc, date),
  });
}
