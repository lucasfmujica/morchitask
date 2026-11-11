"use client";

import { useState, useTransition } from "react";
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

  const pill =
    "h-9 shrink-0 cursor-pointer rounded-pill px-3.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60";

  return (
    // The one panel outlined instead of filled: nothing else on the page has
    // a border, so the outline alone marks it as different. Warm, in the
    // accent, rather than alarm red: it is a place to be careful, and the red
    // is kept for the one button that cannot be taken back.
    <section className="flex flex-col gap-2.5 rounded-2xl p-[18px] ring-[1.5px] ring-accent/35 ring-inset">
      <h2 className="font-display text-base font-semibold text-accent">{t("dangerTitle")}</h2>
      <p className="text-xs leading-[17px] text-muted">{t("dangerDesc")}</p>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleExport}
          disabled={exporting}
          className={`${pill} bg-surface-2 text-fg hover:bg-border`}
        >
          {exporting ? t("exporting") : t("exportDataAction")}
        </button>
        {!confirming && (
          <button
            onClick={() => setConfirming(true)}
            className={`${pill} bg-accent-soft text-accent hover:bg-accent/20`}
          >
            {t("deleteAction")}
          </button>
        )}
      </div>
      {exportError && <p className="text-xs text-danger">{t("exportFailed")}</p>}

      {confirming && (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <p className="text-xs leading-[17px] text-muted">{t("deleteDesc")}</p>
          <p className="text-xs font-semibold text-fg">
            {t("deleteConfirmHint", { word: confirmWord })}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoFocus
              disabled={deleting}
              placeholder={confirmWord}
              aria-label={t("deleteConfirmLabel")}
              className="h-9 w-36 rounded-pill bg-surface-2 px-4 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-danger"
            />
            <button
              onClick={handleDelete}
              disabled={!canDelete || deleting}
              className={`${pill} bg-danger text-on-danger hover:opacity-90 disabled:opacity-40`}
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
              className={`${pill} px-3 text-muted hover:bg-surface-2 hover:text-fg`}
            >
              {t("deleteCancel")}
            </button>
          </div>
          {deleteError && <p className="text-xs text-danger">{t("deleteFailed")}</p>}
        </div>
      )}
    </section>
  );
}
