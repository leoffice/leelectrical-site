// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  buildChatFileLine,
  formatFileSize,
  isImageFile,
  isTextFile,
  readTextExcerpt,
  uploadChatAttachment,
} from "../src/lib/chatAttach.js";

describe("chatAttach", () => {
  it("isImageFile detects mime and extension", () => {
    expect(isImageFile({ type: "image/png", name: "x.bin" })).toBe(true);
    expect(isImageFile({ type: "application/pdf", name: "shot.jpg" })).toBe(true);
    expect(isImageFile({ type: "application/pdf", name: "report.pdf" })).toBe(false);
  });

  it("isTextFile detects text types and extensions", () => {
    expect(isTextFile({ type: "text/plain", name: "a.bin" })).toBe(true);
    expect(isTextFile({ type: "application/pdf", name: "notes.txt" })).toBe(true);
    expect(isTextFile({ type: "application/pdf", name: "report.pdf" })).toBe(false);
  });

  it("formatFileSize renders human sizes", () => {
    expect(formatFileSize(500)).toBe("500 B");
    expect(formatFileSize(2048)).toBe("2.0 KB");
    expect(formatFileSize(2 * 1024 * 1024)).toBe("2.0 MB");
  });

  it("buildChatFileLine includes name, size, url, and excerpt", () => {
    const file = { name: "spec.pdf", size: 1200 };
    const line = buildChatFileLine(file, { fileUrl: "https://x/doc", excerpt: "hello" });
    expect(line).toContain("spec.pdf");
    expect(line).toContain("1.2 KB");
    expect(line).toContain("https://x/doc");
    expect(line).toContain("hello");
  });

  it("readTextExcerpt returns trimmed text for small text files", async () => {
    const file = new File(["alpha\nbeta"], "note.txt", { type: "text/plain" });
    await expect(readTextExcerpt(file)).resolves.toBe("alpha\nbeta");
  });

  it("readTextExcerpt skips large files", async () => {
    const big = "x".repeat(40_000);
    const file = new File([big], "big.txt", { type: "text/plain" });
    await expect(readTextExcerpt(file)).resolves.toBe("");
  });
});

describe("uploadChatAttachment", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ ok: true, key: "chat-1-spec.pdf" }),
      }))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts base64 to docs and returns a fetch url", async () => {
    const file = new File(["pdf"], "spec.pdf", { type: "application/pdf" });
    const url = await uploadChatAttachment(file);
    expect(url).toContain("/docs?key=chat-");
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/docs"),
      expect.objectContaining({ method: "POST" })
    );
  });
});