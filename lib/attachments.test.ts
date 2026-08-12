import { describe, expect, it } from "vitest";
import {
  attachmentPath,
  attachmentSrc,
  extensionOf,
  formatBytes,
  isAllowedType,
  isBlobUrlFor,
  isImage,
  isInlineViewable,
  isValidAttachmentPath,
  MAX_ATTACHMENT_BYTES,
  rejectionReason,
} from "./attachments";

const TASK = "6f1a0a5e-6a2a-4c1e-9b1e-1d2c3b4a5e6f";
const UUID = "0f8fad5b-d9cb-469f-a165-70867728950e";

describe("extensionOf", () => {
  it("takes the last extension, lowercased", () => {
    expect(extensionOf("Foto.JPG")).toBe("jpg");
    expect(extensionOf("factura.final.pdf")).toBe("pdf");
  });
  it("returns empty for names without one", () => {
    expect(extensionOf("recibo")).toBe("");
    expect(extensionOf("archivo.")).toBe("");
  });
  it("treats a leading dot as a hidden file, not an extension", () => {
    expect(extensionOf(".env")).toBe("");
  });
  it("strips anything that isn't a letter or digit", () => {
    expect(extensionOf("foto.j p&g")).toBe("jpg");
    expect(extensionOf("foto.png/../../evil")).toBe("evil");
  });
  it("caps a name pretending to have a huge extension", () => {
    expect(extensionOf(`foto.${"a".repeat(50)}`)).toHaveLength(12);
  });
});

describe("attachmentPath", () => {
  it("files uploads under their task with a random name", () => {
    expect(attachmentPath(TASK, "Estado de cuenta.pdf", UUID)).toBe(
      `attachments/${TASK}/${UUID}.pdf`,
    );
  });
  it("keeps the device's file name out of the URL", () => {
    expect(attachmentPath(TASK, "Estado de cuenta.pdf", UUID)).not.toContain("cuenta");
  });
  it("works for a file with no extension", () => {
    expect(attachmentPath(TASK, "recibo", UUID)).toBe(`attachments/${TASK}/${UUID}`);
  });
  it("produces a path it accepts back", () => {
    expect(isValidAttachmentPath(attachmentPath(TASK, "foto.png", UUID), TASK)).toBe(true);
  });
});

describe("isValidAttachmentPath", () => {
  it("accepts this task's folder", () => {
    expect(isValidAttachmentPath(`attachments/${TASK}/${UUID}.jpg`, TASK)).toBe(true);
    expect(isValidAttachmentPath(`attachments/${TASK}/${UUID}`, TASK)).toBe(true);
  });
  it("rejects another task's folder", () => {
    const other = "11111111-2222-3333-4444-555555555555";
    expect(isValidAttachmentPath(`attachments/${other}/${UUID}.jpg`, TASK)).toBe(false);
  });
  it("rejects climbing out of the folder", () => {
    expect(isValidAttachmentPath(`attachments/${TASK}/../../avatars/x.jpg`, TASK)).toBe(false);
    expect(isValidAttachmentPath(`attachments/${TASK}/sub/${UUID}.jpg`, TASK)).toBe(false);
  });
  it("rejects a name that isn't the id we generate", () => {
    expect(isValidAttachmentPath(`attachments/${TASK}/factura.pdf`, TASK)).toBe(false);
    expect(isValidAttachmentPath(`attachments/${TASK}/${UUID}.jpg.exe`, TASK)).toBe(false);
  });
  it("rejects a path outside attachments entirely", () => {
    expect(isValidAttachmentPath(`avatars/${TASK}/${UUID}.jpg`, TASK)).toBe(false);
  });
});

describe("isBlobUrlFor", () => {
  const path = `attachments/${TASK}/${UUID}.pdf`;

  it("accepts the blob URL for that exact path", () => {
    expect(isBlobUrlFor(`https://abc123.private.blob.vercel-storage.com/${path}`, path)).toBe(true);
  });
  it("accepts a URL whose path arrives percent-encoded", () => {
    expect(
      isBlobUrlFor(`https://abc123.private.blob.vercel-storage.com/${encodeURI(path)}`, path),
    ).toBe(true);
  });
  it("rejects a URL for a different path", () => {
    const other = `attachments/${TASK}/11111111-2222-3333-4444-555555555555.pdf`;
    expect(isBlobUrlFor(`https://abc123.private.blob.vercel-storage.com/${other}`, path)).toBe(
      false,
    );
  });
  it("rejects another host, however similar", () => {
    expect(isBlobUrlFor(`https://evil.com/${path}`, path)).toBe(false);
    expect(isBlobUrlFor(`https://public.blob.vercel-storage.com.evil.com/${path}`, path)).toBe(
      false,
    );
  });
  it("rejects plain http and garbage", () => {
    expect(isBlobUrlFor(`http://abc123.private.blob.vercel-storage.com/${path}`, path)).toBe(false);
    expect(isBlobUrlFor("not a url", path)).toBe(false);
  });
  it("rejects a public-store URL — this store is private", () => {
    expect(isBlobUrlFor(`https://abc123.public.blob.vercel-storage.com/${path}`, path)).toBe(false);
  });
});

describe("attachmentSrc / isInlineViewable", () => {
  it("reads files through the app's own route, never the blob URL", () => {
    expect(attachmentSrc("abc")).toBe("/api/attachments/abc");
  });
  it("shows photos and PDFs in place, hands the rest to the device", () => {
    expect(isInlineViewable("image/png")).toBe(true);
    expect(isInlineViewable("application/pdf")).toBe(true);
    expect(isInlineViewable("text/csv")).toBe(false);
  });
});

describe("isAllowedType / isImage", () => {
  it("allows photos and documents", () => {
    expect(isAllowedType("image/jpeg")).toBe(true);
    expect(isAllowedType("application/pdf")).toBe(true);
  });
  it("blocks anything else", () => {
    expect(isAllowedType("application/x-msdownload")).toBe(false);
    expect(isAllowedType("")).toBe(false);
  });
  it("knows which ones get a thumbnail", () => {
    expect(isImage("image/heic")).toBe(true);
    expect(isImage("application/pdf")).toBe(false);
  });
});

describe("formatBytes", () => {
  it("scales to the unit that reads best", () => {
    expect(formatBytes(900)).toBe("900 B");
    expect(formatBytes(20 * 1024)).toBe("20 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5 MB");
    expect(formatBytes(2.55 * 1024 * 1024)).toBe("2.6 MB");
  });
  it("drops the decimal once the number is big", () => {
    expect(formatBytes(12.4 * 1024 * 1024)).toBe("12 MB");
  });
  it("guards empty and nonsense", () => {
    expect(formatBytes(0)).toBe("0 KB");
    expect(formatBytes(Number.NaN)).toBe("0 KB");
  });
});

describe("rejectionReason", () => {
  it("passes a normal photo", () => {
    expect(rejectionReason({ type: "image/jpeg", size: 3 * 1024 * 1024 })).toBeNull();
  });
  it("names the size limit when the file is too big", () => {
    const reason = rejectionReason({ type: "image/jpeg", size: MAX_ATTACHMENT_BYTES + 1 });
    expect(reason).toContain("10 MB");
  });
  it("rejects a type that isn't allowed", () => {
    expect(rejectionReason({ type: "application/x-msdownload", size: 10 })).toMatch(/tipo/);
  });
  it("rejects an empty file", () => {
    expect(rejectionReason({ type: "image/png", size: 0 })).toMatch(/vac/);
  });
});
