// Full-screen in-app PDF viewer — view first, then download / share / close.
import React, { useEffect, useMemo, useState } from "react";
import { downloadPdfBlob, sharePdfBlob } from "../lib/pdfOpen.js";
import { lockBodyScroll } from "../lib/scrollLock.js";

/**
 * @param {{
 *   blob?: Blob | null,
 *   url?: string,
 *   title?: string,
 *   filename?: string,
 *   onClose: () => void,
 * }} props
 */
export default function LocalDocViewer({ blob, url, title = "Document", filename = "document.pdf", onClose }) {
  const [shareBusy, setShareBusy] = useState(false);
  const [shareNote, setShareNote] = useState("");

  const objectUrl = useMemo(() => {
    if (url) return "";
    if (!blob || typeof URL === "undefined" || !URL.createObjectURL) return "";
    return URL.createObjectURL(blob);
  }, [blob, url]);

  const src = url || objectUrl;

  useEffect(() => {
    if (!objectUrl) return undefined;
    return () => {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {
        /* ignore */
      }
    };
  }, [objectUrl]);

  useEffect(() => lockBodyScroll(), []);

  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const onDownload = () => {
    if (blob) {
      downloadPdfBlob(blob, filename);
      return;
    }
    if (!src || typeof document === "undefined") return;
    const a = document.createElement("a");
    a.href = src;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const onShare = async () => {
    if (shareBusy) return;
    setShareBusy(true);
    setShareNote("");
    try {
      if (blob) {
        const result = await sharePdfBlob(blob, filename, title);
        if (result === "shared") return;
        if (result === "aborted") return;
        // No native share — fall back to download so user still gets the file.
        downloadPdfBlob(blob, filename);
        setShareNote("Saved a copy — use Share from your files if needed");
        return;
      }
      if (typeof navigator !== "undefined" && navigator.share && src && !src.startsWith("blob:")) {
        await navigator.share({ title, url: src });
        return;
      }
      onDownload();
      setShareNote("Saved a copy — use Share from your files if needed");
    } catch {
      onDownload();
    } finally {
      setShareBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col bg-slate-950"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-testid="local-doc-viewer"
    >
      <header className="flex items-center gap-2 px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 bg-slate-900 border-b border-slate-700 shrink-0">
        <h2 className="flex-1 min-w-0 font-extrabold text-white text-sm truncate px-1">{title}</h2>
        <button
          type="button"
          className="shrink-0 rounded-full bg-slate-800 text-white text-xs font-bold px-3 py-2 active:bg-slate-700"
          onClick={onDownload}
          data-testid="local-doc-download"
        >
          Download
        </button>
        <button
          type="button"
          className="shrink-0 rounded-full bg-brand text-white text-xs font-bold px-3 py-2 active:opacity-90 disabled:opacity-60"
          onClick={onShare}
          disabled={shareBusy}
          data-testid="local-doc-share"
        >
          {shareBusy ? "…" : "Share"}
        </button>
        <button
          type="button"
          aria-label="Close"
          className="shrink-0 w-9 h-9 rounded-full bg-slate-800 text-white font-bold text-sm"
          onClick={onClose}
          data-testid="local-doc-close"
        >
          ✕
        </button>
      </header>
      {shareNote ? (
        <p className="text-[11px] text-amber-200 bg-amber-950/80 px-3 py-1.5 shrink-0" data-testid="local-doc-share-note">
          {shareNote}
        </p>
      ) : null}
      <div className="flex-1 min-h-0 bg-slate-200 relative">
        {src ? (
          <iframe
            title={title}
            src={src}
            className="absolute inset-0 w-full h-full border-0 bg-white"
            data-testid="local-doc-frame"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-slate-600 text-sm">
            Couldn’t open this document for preview. Use Download instead.
          </div>
        )}
      </div>
      <div className="shrink-0 flex gap-2 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-slate-900 border-t border-slate-700">
        <button type="button" className="btn flex-1 !py-3 bg-slate-800 text-white font-semibold" onClick={onClose}>
          Close
        </button>
        <button
          type="button"
          className="btn flex-1 !py-3 bg-brand-soft text-brand font-semibold"
          onClick={onDownload}
          data-testid="local-doc-download-footer"
        >
          Download
        </button>
      </div>
    </div>
  );
}
