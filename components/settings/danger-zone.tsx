"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { clearActiveTimersForSignOut } from "@/lib/stores/active-timer";
import { useTranslations } from "next-intl";
import { deleteMyAccount } from "@/lib/actions/account";
import { useExportMyData } from "./use-export-data";

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
  const { exporting, failed: exportError, run: handleExport } = useExportMyData();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  // "billing" is its own message: the plan could not be cancelled, so the
  // delete never started, which is a different thing to tell someone than
  // "something failed".
  const [deleteError, setDeleteError] = useState<false | "failed" | "billing">(false);

  const confirmWord = t("deleteWord");
  const canDelete = typed.trim().toUpperCase() === confirmWord.toUpperCase();

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(false);
    try {
      const res = await deleteMyAccount();
      if (!res.ok) {
        setDeleteError(res.error);
        setDeleting(false);
        return;
      }
    } catch {
      setDeleteError("failed");
      setDeleting(false);
      return;
    }
    // The session rows are already gone; this is what clears the cookie the
    // browser is still holding.
    clearActiveTimersForSignOut();
    await signOut({ redirectTo: "/" });
  }

  const pill =
    "h-9 shrink-0 cursor-pointer rounded-pill px-3.5 text-2xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60";

  return (
    // The one panel outlined instead of filled: nothing else on the page has
    // a border, so the outline alone marks it as different. Warm, in the
    // accent, rather than alarm red: it is a place to be careful, and the red
    // is kept for the one button that cannot be taken back.
    <section
      id="danger"
      className="flex scroll-mt-4 flex-col gap-2.5 rounded-[28px] p-[18px] shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,var(--color-accent)_28%,var(--color-bg))]"
    >
      <h2 className="font-display text-sm font-semibold text-accent">{t("dangerTitle")}</h2>
      <p className="text-2xs leading-[17px] text-muted">{t("dangerDesc")}</p>
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
          {deleteError && (
            <p className="text-xs text-danger">
              {deleteError === "billing" ? t("deleteBillingFailed") : t("deleteFailed")}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
