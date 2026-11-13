"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useAddComment, useComments, useDeleteComment } from "@/lib/queries/comments";
import { useMe, useProfiles } from "@/lib/queries/profiles";
import { cn } from "@/lib/utils";
import { OwnerAvatar } from "./owner-avatar";
import { useTranslations } from "next-intl";

/** Comment thread on a task — both household members can read and post. */
export function TaskComments({ taskId }: { taskId: string }) {
  const t = useTranslations("tasks");
  const tcm = useTranslations("common");
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
    <div className="flex flex-col gap-3">
      {comments.length > 0 && (
        <ul className="flex flex-col gap-3">
          {comments.map((c) => {
            const author = profiles.find((p) => p.id === c.author_id);
            const mine = c.author_id === me?.id;
            return (
              <li key={c.id} className="group flex items-start gap-2.5">
                <span className="shrink-0">
                  <OwnerAvatar
                    profile={
                      author ??
                      (c.author_name
                        ? {
                            id: c.author_id,
                            household_id: c.household_id,
                            display_name: c.author_name,
                            color: "var(--color-subtle)",
                            avatar_url: null,
                          }
                        : undefined)
                    }
                    size={28}
                  />
                </span>
                {/* A chat bubble with its corner pointing at the avatar. */}
                <div className="min-w-0 rounded-[4px_16px_16px_16px] bg-bg px-3 py-2.5">
                  {/* The avatar already says who; the name is for screen readers. */}
                  <p className="sr-only">
                    {mine ? tcm("you") : (author?.display_name ?? c.author_name ?? t("someone"))}
                  </p>
                  <p className="text-xs leading-[19px] break-words text-fg">{c.body}</p>
                </div>
                {mine && (
                  <button
                    onClick={() => remove.mutate(c.id)}
                    aria-label={t("deleteComment")}
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

      <div className="flex items-center gap-2 rounded-pill bg-bg py-[5px] pr-[5px] pl-4 focus-within:ring-2 focus-within:ring-focus">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder={t("commentPlaceholder")}
          aria-label={t("newComment")}
          className="min-w-0 flex-1 bg-transparent text-sm text-fg placeholder:text-subtle outline-none"
        />
        {/* Green disc with an arrow: sending is the "yes" of this box. */}
        <button
          onClick={submit}
          disabled={!body.trim()}
          aria-label={t("sendComment")}
          className={cn(
            "flex h-[34px] w-[34px] shrink-0 cursor-pointer items-center justify-center rounded-full bg-fit text-on-primary transition-opacity disabled:cursor-default disabled:opacity-40",
          )}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M8 13V3M4 7l4-4 4 4" />
          </svg>
        </button>
      </div>
    </div>
  );
}
