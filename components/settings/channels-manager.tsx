"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
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
  // Which category has its colours open. The row stays one line like the
  // canvas draws it; the palette only unfolds for the one being recoloured.
  const [recolouring, setRecolouring] = useState<string | null>(null);

  function add() {
    const n = name.trim();
    if (!n) return;
    create.mutate({ name: n, color: CHANNEL_COLORS[channels.length % CHANNEL_COLORS.length] });
    setName("");
  }

  return (
    // Two across once the page is wide: with ten categories a single list was
    // the tallest thing in Ajustes. items-start, so opening one row's palette
    // does not stretch the row beside it.
    <div className="grid grid-cols-1 items-start gap-1.5 @2xl:grid-cols-2">
      {channels.map((c) => (
        <div key={c.id} className="rounded-2xl bg-surface py-2.5 pr-2.5 pl-3.5">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setRecolouring((id) => (id === c.id ? null : c.id))}
              aria-label={t("changeColor", { name: c.name })}
              aria-expanded={recolouring === c.id}
              className="-mx-[5px] flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-surface-2"
            >
              <span className="h-3.5 w-3.5 rounded-[5px]" style={{ backgroundColor: c.color }} />
            </button>
            <input
              defaultValue={c.name}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== c.name) update.mutate({ id: c.id, patch: { name: v } });
              }}
              className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-fg outline-none"
              aria-label={t("categoryName")}
            />
            <button
              onClick={() => remove.mutate(c.id)}
              aria-label={t("deleteCategory", { name: c.name })}
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-danger"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
            </button>
          </div>
          {recolouring === c.id && (
            <div className="mt-2 flex flex-wrap gap-2 pb-0.5 pl-6">
              {CHANNEL_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => update.mutate({ id: c.id, patch: { color } })}
                  aria-label={t("colorSwatch", { color })}
                  aria-pressed={c.color === color}
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
          )}
        </div>
      ))}

      <div className="flex items-center gap-2 rounded-pill bg-surface p-1.5 pl-4 @2xl:col-span-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder={t("newCategoryPlaceholder")}
          aria-label={t("newCategory")}
          className="h-8 min-w-0 flex-1 bg-transparent text-sm text-fg placeholder:text-subtle outline-none"
        />
        <button
          onClick={add}
          disabled={!name.trim()}
          className={cn(
            "h-[34px] shrink-0 cursor-pointer rounded-pill bg-surface-2 px-3.5 text-2xs font-semibold text-fg transition-colors hover:bg-border",
            !name.trim() && "opacity-40",
          )}
        >
          {t("add")}
        </button>
      </div>
    </div>
  );
}
