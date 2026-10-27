"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  CHANNEL_COLORS,
  useChannels,
  useCreateChannel,
  useDeleteChannel,
  useUpdateChannel,
} from "@/lib/queries/channels";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

export function ChannelsManager() {
  const t = useTranslations("settings");
  const channels = useChannels().data ?? [];
  const create = useCreateChannel();
  const update = useUpdateChannel();
  const remove = useDeleteChannel();
  const [name, setName] = useState("");

  function add() {
    const n = name.trim();
    if (!n) return;
    create.mutate({ name: n, color: CHANNEL_COLORS[channels.length % CHANNEL_COLORS.length] });
    setName("");
  }

  return (
    <div className="flex flex-col gap-2">
      {channels.map((c) => (
        <div key={c.id} className="rounded-xl border border-border bg-surface p-3">
          <div className="flex items-center gap-2">
            <span
              className="h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: c.color }}
              aria-hidden
            />
            <input
              defaultValue={c.name}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== c.name) update.mutate({ id: c.id, patch: { name: v } });
              }}
              className="flex-1 bg-transparent text-sm font-medium text-fg outline-none"
              aria-label={t("categoryName")}
            />
            <button
              onClick={() => remove.mutate(c.id)}
              aria-label={t("deleteCategory", { name: c.name })}
              className="cursor-pointer text-muted transition-colors hover:text-danger"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-2 pl-5">
            {CHANNEL_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => update.mutate({ id: c.id, patch: { color } })}
                aria-label={t("colorSwatch", { color })}
                className="h-5 w-5 cursor-pointer rounded-full transition-transform hover:scale-110"
                style={{
                  backgroundColor: color,
                  boxShadow:
                    c.color === color
                      ? `0 0 0 2px var(--color-surface), 0 0 0 4px ${color}`
                      : undefined,
                }}
              />
            ))}
          </div>
        </div>
      ))}

      <div className="flex items-center gap-2 rounded-xl border border-dashed border-border p-2">
        <Plus className="ml-1 h-4 w-4 shrink-0 text-subtle" aria-hidden />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder={t("newCategoryPlaceholder")}
          aria-label={t("newCategory")}
          className="h-8 flex-1 bg-transparent text-sm text-fg placeholder:text-subtle outline-none"
        />
        <button
          onClick={add}
          disabled={!name.trim()}
          className={cn(
            "h-8 shrink-0 cursor-pointer rounded-lg bg-primary px-3 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover",
            !name.trim() && "opacity-40",
          )}
        >
          {t("add")}
        </button>
      </div>
    </div>
  );
}
