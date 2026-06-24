"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useAddComment, useComments, useDeleteComment } from "@/lib/queries/comments";
import { useMe, useProfiles } from "@/lib/queries/profiles";
import { cn } from "@/lib/utils";
import { OwnerAvatar } from "./owner-avatar";

/** Comment thread on a task — both household members can read and post. */
export function TaskComments({ taskId }: { taskId: string }) {
  const me = useMe().data;
  const profiles = useProfiles().data ?? [];
  const { data: comments = [] } = useComments(taskId);
  const add = useAddComment(taskId);
  const remove = useDeleteComment(taskId);
  const [body, setBody] = useState("");

  function submit() {
    const text = body.trim();
    if (!text) return;
    add.mutate(text);
    setBody("");
  }

  return (
    <div className="flex flex-col gap-2">
      {comments.length > 0 && (
        <ul className="flex flex-col gap-2">
          {comments.map((c) => {
            const author = profiles.find((p) => p.id === c.author_id);
            const mine = c.author_id === me?.id;
            return (
              <li key={c.id} className="group flex items-start gap-2">
                <span className="mt-0.5 shrink-0">
                  <OwnerAvatar profile={author} size={22} />
                </span>
                <div className="min-w-0 flex-1 rounded-xl rounded-tl-sm bg-surface-2 px-3 py-2">
                  <p className="text-xs font-semibold text-muted">
                    {mine ? "Vos" : (author?.display_name ?? "Alguien")}
                  </p>
                  <p className="break-words text-sm text-fg">{c.body}</p>
                </div>
                {mine && (
                  <button
                    onClick={() => remove.mutate(c.id)}
                    aria-label="Eliminar comentario"
                    className="-m-1 flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted opacity-0 transition-opacity hover:bg-danger/10 hover:text-danger group-hover:opacity-100 touch:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-1.5 focus-within:ring-2 focus-within:ring-focus">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Escribí un comentario…"
          aria-label="Nuevo comentario"
          className="min-w-0 flex-1 bg-transparent text-sm text-fg placeholder:text-subtle outline-none"
        />
        <button
          onClick={submit}
          disabled={!body.trim()}
          className={cn(
            "h-7 shrink-0 cursor-pointer rounded-md bg-primary px-2.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40",
          )}
        >
          Enviar
        </button>
      </div>
    </div>
  );
}
