import { put } from "@vercel/blob";
import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { attachmentPath, rejectionKey } from "@/lib/attachments";
import { auth } from "@/lib/auth";
import { addAttachment } from "@/lib/db/queries/attachments";
import { backlogTasks, insertTask, updateTask } from "@/lib/db/queries/tasks";
import { orderForAppend } from "@/lib/ordering";
import { buildSharedTask } from "@/lib/share";

/** A share sheet can hand over a whole album; past this it's not one task. */
const MAX_SHARED_FILES = 5;

function redirectTo(req: NextRequest, path: string) {
  // 303 so the browser follows with a GET — the share arrived as a POST.
  return NextResponse.redirect(new URL(path, req.nextUrl.origin), 303);
}

function field(form: FormData, name: string): string | null {
  const value = form.get(name);
  return typeof value === "string" ? value : null;
}

/**
 * Web Share Target: "Compartir → Morchitask" from another app lands here (see
 * `share_target` in app/manifest.ts). Whatever was shared becomes a backlog
 * task — link and extra text in its notes, photos/PDFs as attachments — and the
 * backlog opens it so it can be sorted right away.
 *
 * The files arrive inside this request instead of going browser → Blob like
 * the task sheet's uploads, because the OS posts the share directly here; so
 * the same type/size rules as `/api/attachments/upload` are applied by hand.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  // Public in the proxy so an expired session gets a GET redirect to /login
  // rather than a re-POST of the share there.
  if (!session?.householdId) return redirectTo(req, "/login");
  const { householdId } = session;
  const userId = session.user.id;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    // Malformed, or bigger than the platform lets a request be (~4.5 MB).
    return redirectTo(req, "/backlog?shared=error");
  }

  const files = form
    .getAll("files")
    .filter((f): f is File => f instanceof File && rejectionKey(f) === null)
    .slice(0, MAX_SHARED_FILES);

  // The request's own language (cookie, then Accept-Language) — the same
  // rule every rendered page uses.
  const t = await getTranslations("backlog");
  const { title, notes } = buildSharedTask(
    {
      title: field(form, "title"),
      text: field(form, "text"),
      url: field(form, "url"),
      fileCount: files.length,
    },
    { filesOnly: t("sharedFilesOnlyTitle"), empty: t("sharedEmptyTitle") },
  );

  const backlog = await backlogTasks(householdId, userId);
  const task = await insertTask(householdId, userId, {
    title,
    plannedDate: null,
    sortOrder: orderForAppend(backlog.map((t) => t.sort_order)),
  });
  if (notes) await updateTask(householdId, task.id, { notes });

  // One file failing (Blob hiccup) shouldn't lose the task or the others.
  await Promise.all(
    files.map(async (file) => {
      try {
        const pathname = attachmentPath(task.id, file.name, crypto.randomUUID());
        const blob = await put(pathname, file, {
          access: "private",
          contentType: file.type,
          addRandomSuffix: false,
        });
        await addAttachment(householdId, task.id, userId, {
          url: blob.url,
          pathname: blob.pathname,
          name: file.name.trim().slice(0, 200) || "archivo",
          contentType: file.type,
          sizeBytes: file.size,
        });
      } catch (err) {
        console.error("share: attachment failed", err);
      }
    }),
  );

  return redirectTo(req, `/backlog?shared=${task.id}`);
}

/** Opening /share directly (a bookmark, an old share) just goes to the backlog. */
export function GET(req: NextRequest) {
  return redirectTo(req, "/backlog");
}
