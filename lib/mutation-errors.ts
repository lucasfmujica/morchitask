/**
 * The one decision behind the "didn't save" toast: whether a failed mutation
 * gets it.
 *
 * Every optimistic mutation rolls its change back on error, and almost none
 * said anything: the card jumped back (or did not, if nothing was cached) and
 * the person had no way to know their edit was gone. So a failure toasts by
 * default, from the query client itself, and a screen that already shows its
 * own error opts out. Two messages for one failure would be worse than one.
 */

export type MutationErrorMeta = {
  /** The screen shows its own error for this mutation; skip the toast. */
  ownErrorUi?: boolean;
};

/** Spread into a mutation's options (or pass through a hook's `opts`) when the
 *  caller already tells the person what went wrong. */
export const OWN_ERROR_UI = { meta: { ownErrorUi: true } } as const;

export function shouldToastMutationError(meta: Record<string, unknown> | undefined): boolean {
  return meta?.ownErrorUi !== true;
}
