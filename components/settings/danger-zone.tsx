"use client";

import { useState, useTransition } from "react";
import { Download, Trash2 } from "lucide-react";
import { signOut } from "next-auth/react";
import { useTranslations } from "next-intl";
import { deleteMyAccount, exportMyData } from "@/lib/actions/account";

/**
 * Taking your data out, and taking yourself out.
 *
 * Both are promised in the privacy policy, so neither is buried: they sit in
 * Settings like everything else. The delete is the only destructive action in
 * the app with no undo, which is why it asks for a typed word rather than a
 * second click — a confirm dialog is dismissed by reflex, a word typed out is
 * not. The word is shown on screen, so nothing has to be remembered.
 */
export function DangerZone() {
  const t = useTranslations("settings");
  const [exporting, startExport] = useTransition();
  const [exportError, setExportError] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(false);

  const confirmWord = t("deleteWord");
  const canDelete = typed.trim().toUpperCase() === confirmWord.toUpperCase();

  function handleExport() {
    setExportError(false);
    startExport(async () => {
      try {
        const payload = await exportMyData();
        // Built in the browser rather than served from a route: the data is
        // already here, and a download endpoint would be one more authenticated
        // surface to get wrong.
        const url = URL.createObjectURL(
          new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
        );
        const a = document.createElement("a");
        a.href = url;
        a.download = `morchitask-${payload.exported_at.slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
      } catch {
        setExportError(true);
      }
    });
  }

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(false);
    try {
      await deleteMyAccount();
    } catch {
      setDeleteError(true);
      setDeleting(false);
      return;
    }
    // The session rows are already gone; this is what clears the cookie the
    // browser is still holding.
    await signOut({ redirectTo: "/" });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 rounded-xl bg-surface p-3.5 shadow-soft sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
            <Download className="h-[18px] w-[18px]" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-fg">{t("exportTitle")}</p>
            <p className="text-xs text-muted">
              {exportError ? t("exportFailed") : t("exportDesc")}
            </p>
          </div>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="ml-12 h-9 w-fit cursor-pointer rounded-pill bg-surface-2 px-4 text-sm font-semibold text-fg transition-colors hover:bg-border disabled:opacity-60 sm:ml-0 sm:shrink-0"
        >
          {exporting ? t("exporting") : t("exportAction")}
        </button>
      </div>

      {/* The one card outlined in danger: nothing else on the page is
          bordered any more, so the outline alone marks it as different. */}
      <div className="flex flex-col gap-3 rounded-xl bg-surface p-3.5 ring-[1.5px] ring-danger/40 ring-inset">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-danger/10 text-danger">
            <Trash2 className="h-[18px] w-[18px]" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-danger">{t("deleteTitle")}</p>
            <p className="text-xs text-muted">{t("deleteDesc")}</p>
          </div>
          {!confirming && (
            <button
              onClick={() => setConfirming(true)}
              className="h-9 shrink-0 cursor-pointer rounded-pill bg-danger/10 px-4 text-sm font-semibold text-danger transition-colors hover:bg-danger/20"
            >
              {t("deleteAction")}
            </button>
          )}
        </div>

        {confirming && (
          <div className="flex flex-col gap-2 border-t border-border pt-3 pl-12">
            <p className="text-xs text-muted">{t("deleteConfirmHint", { word: confirmWord })}</p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoFocus
                disabled={deleting}
                placeholder={confirmWord}
                aria-label={t("deleteConfirmLabel")}
                className="h-9 w-40 rounded-pill bg-surface-2 px-4 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-danger"
              />
              <button
                onClick={handleDelete}
                disabled={!canDelete || deleting}
                className="h-9 cursor-pointer rounded-pill bg-danger px-4 text-sm font-semibold text-on-danger transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {deleting ? t("deleting") : t("deleteConfirmAction")}
              </button>
              <button
                onClick={() => {
                  setConfirming(false);
                  setTyped("");
                  setDeleteError(false);
                }}
                disabled={deleting}
                className="h-9 cursor-pointer rounded-pill px-3 text-sm font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-fg"
              >
                {t("deleteCancel")}
              </button>
            </div>
            {deleteError && <p className="text-xs text-danger">{t("deleteFailed")}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
