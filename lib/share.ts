/**
 * Turning what another app shares ("Compartir → Morchitask") into a task.
 * Pure logic, so the /share route stays a thin shell around it.
 *
 * Apps fill the three share fields very differently: Chrome sends the page
 * title + url, many Android apps put the link inside `text`, Photos sends only
 * files. So the title is the first thing that reads like one, and everything
 * else that was shared goes in the notes rather than being dropped.
 */

/** A shared page title can be a whole SEO sentence; a task title shouldn't be. */
export const MAX_SHARED_TITLE = 120;

/** Notes are free text, but a whole shared article is not a note. */
export const MAX_SHARED_NOTES = 4000;

/** Title for a share that carried only files (a photo, a PDF). */
export const FILES_ONLY_TITLE = "Archivo compartido";

/** Title for a share that carried nothing usable at all. */
export const EMPTY_SHARE_TITLE = "Algo compartido";

export type SharedInput = {
  title?: string | null;
  text?: string | null;
  url?: string | null;
  fileCount?: number;
};

export type SharedTask = { title: string; notes: string | null };

/** Trim and squash runs of spaces/newlines into one space — for the title. */
function oneLine(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function clip(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

/** Titles for shares with no words of their own — the route passes them in
 *  the person's language; these are the Spanish defaults. */
export type ShareFallbackTitles = { filesOnly: string; empty: string };

export function buildSharedTask(
  input: SharedInput,
  fallbacks: ShareFallbackTitles = { filesOnly: FILES_ONLY_TITLE, empty: EMPTY_SHARE_TITLE },
): SharedTask {
  const title = oneLine(input.title);
  const text = (input.text ?? "").trim();
  const url = oneLine(input.url);

  // The first non-empty field wins, in the order the spec intends them.
  const source = title || oneLine(text) || url;
  const taskTitle = source
    ? clip(source, MAX_SHARED_TITLE)
    : (input.fileCount ?? 0) > 0
      ? fallbacks.filesOnly
      : fallbacks.empty;

  // Notes keep whatever the title didn't already say in full: the text when it
  // wasn't the title (or got cut short), and the link unless it's already in
  // the text — Android apps often send "Mirá esto https://…" as `text` too.
  const notes: string[] = [];
  const textUsedWhole = !title && oneLine(text) === taskTitle;
  if (text && !textUsedWhole) notes.push(text);
  const urlUsedWhole = !title && !text && url === taskTitle;
  if (url && !urlUsedWhole && !text.includes(url)) notes.push(url);

  const joined = notes.join("\n\n");
  return { title: taskTitle, notes: joined ? clip(joined, MAX_SHARED_NOTES) : null };
}
