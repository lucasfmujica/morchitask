import { describe, expect, it } from "vitest";
import {
  EMPTY_SHARE_TITLE,
  FILES_ONLY_TITLE,
  MAX_SHARED_NOTES,
  MAX_SHARED_TITLE,
  buildSharedTask,
} from "./share";

describe("buildSharedTask", () => {
  it("uses the page title and keeps the link in the notes", () => {
    expect(buildSharedTask({ title: "Receta de ñoquis", url: "https://x.com/r" })).toEqual({
      title: "Receta de ñoquis",
      notes: "https://x.com/r",
    });
  });

  it("falls back to text, and doesn't repeat it in the notes", () => {
    expect(buildSharedTask({ text: "  Llamar al plomero  " })).toEqual({
      title: "Llamar al plomero",
      notes: null,
    });
  });

  it("doesn't add the link twice when the text already contains it", () => {
    const r = buildSharedTask({ text: "Mirá esto https://x.com/a", url: "https://x.com/a" });
    expect(r).toEqual({ title: "Mirá esto https://x.com/a", notes: null });
  });

  it("keeps text and link in the notes when there's a title", () => {
    const r = buildSharedTask({ title: "Hotel", text: "Para marzo", url: "https://h.com" });
    expect(r.notes).toBe("Para marzo\n\nhttps://h.com");
  });

  it("uses a bare url as the title", () => {
    expect(buildSharedTask({ url: "https://x.com" })).toEqual({
      title: "https://x.com",
      notes: null,
    });
  });

  it("squashes line breaks in the title but keeps them in the notes", () => {
    const r = buildSharedTask({ text: "Comprar:\nleche\nhuevos" });
    expect(r.title).toBe("Comprar: leche huevos");
    expect(r.notes).toBeNull();
  });

  it("clips a long title and keeps the full text in the notes", () => {
    const long = "a".repeat(MAX_SHARED_TITLE + 50);
    const r = buildSharedTask({ text: long });
    expect(r.title).toHaveLength(MAX_SHARED_TITLE);
    expect(r.title.endsWith("…")).toBe(true);
    expect(r.notes).toBe(long);
  });

  it("keeps a clipped url in the notes", () => {
    const url = `https://x.com/${"p".repeat(MAX_SHARED_TITLE)}`;
    expect(buildSharedTask({ url }).notes).toBe(url);
  });

  it("caps very long notes", () => {
    const r = buildSharedTask({ title: "Artículo", text: "b".repeat(MAX_SHARED_NOTES * 2) });
    expect(r.notes).toHaveLength(MAX_SHARED_NOTES);
  });

  it("names file-only and empty shares", () => {
    expect(buildSharedTask({ fileCount: 2 })).toEqual({ title: FILES_ONLY_TITLE, notes: null });
    expect(buildSharedTask({ title: "  ", text: null })).toEqual({
      title: EMPTY_SHARE_TITLE,
      notes: null,
    });
  });
});
