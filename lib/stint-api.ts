import "server-only";
import { z } from "zod";
import type { RemoteTask, StintStatus } from "@/lib/stint";

/**
 * Talking to Stint's link API (stint-app: app/api/link). The address is ours,
 * from the environment, never typed by the user: the server fetches it with
 * their token, so it must not be pointable at anything else.
 */
const BASE = (process.env.STINT_API_URL ?? "https://stint-app-blue.vercel.app/api/link").replace(
  /\/$/,
  "",
);

const Status = z.enum(["todo", "doing", "review", "done"]);
const Listing = z.object({
  workspace: z.object({ name: z.string() }),
  tasks: z.array(
    z.object({
      id: z.uuid(),
      title: z.string(),
      status: Status,
      client: z.string().nullable(),
      deadline: z.string().nullable(),
      url: z.string(),
    }),
  ),
});

export class StintUnauthorized extends Error {}

function headers(token: string) {
  return { authorization: `Bearer ${token}`, "content-type": "application/json" };
}

export async function fetchStintTasks(
  token: string,
): Promise<{ workspaceName: string; tasks: RemoteTask[] }> {
  const res = await fetch(`${BASE}/tasks`, {
    headers: headers(token),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (res.status === 401) throw new StintUnauthorized();
  if (!res.ok) throw new Error(`stint ${res.status}`);
  const body = Listing.parse(await res.json());
  return { workspaceName: body.workspace.name, tasks: body.tasks };
}

/** Moves a task there. Returns the status Stint now has, or null if it refused. */
export async function pushStintStatus(
  token: string,
  stintTaskId: string,
  status: "todo" | "doing" | "done",
): Promise<StintStatus | null> {
  const res = await fetch(`${BASE}/tasks/${encodeURIComponent(stintTaskId)}`, {
    method: "PATCH",
    headers: headers(token),
    body: JSON.stringify({ status }),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const parsed = z.object({ status: Status }).safeParse(await res.json());
  return parsed.success ? parsed.data.status : null;
}
