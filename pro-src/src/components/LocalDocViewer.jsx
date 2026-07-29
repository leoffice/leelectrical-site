// Full-screen in-app PDF viewer — view first, then download / share / close.
// On iPhone/Android, iframe blob PDFs show a blank page + UUID; use native open instead.
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  downloadPdfBlob,
  ensurePdfBlob,
  openPdfForNativeView,
  openPdfUrl,
  pdfInlinePreviewSupported,
  sharePdfBlob,
} from "../lib/pdfOpen.js";
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
  const [inlineOk] = useState(() => pdfInlinePreviewSupported());
  const autoOpened = useRef(false);

  const pdfBlob = useMemo(() => ensurePdfBlob(blob), [blob]);

  const objectUrl = useMemo(() => {
    if (url) return "";
    if (!pdfBlob || typeof URL === "undefined" || !URL.createObjectURL) return "";
    return URL.createObjectURL(pdfBlob);
  }, [pdfBlob, url]);

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

  // Phone: open the real PDF in the device viewer once (iframe is blank there).
  useEffect(() => {
    if (inlineOk || autoOpened.current) return;
    if (!pdfBlob && !url) return;
    autoOpened.current = true;
    openPdfForNativeView({ blob: pdfBlob, url: url || "", filename });
  }, [inlineOk, pdfBlob, url, filename]);

  const onDownload = () => {
    if (pdfBlob) {
      downloadPdfBlob(pdfBlob, filename);
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

  const onNativeOpen = () => {
    openPdfForNativeView({ blob: pdfBlob, url: url || src || "", filename });
  };

  const onShare = async () => {
    if (shareBusy) return;
    setShareBusy(true);
    setShareNote("");
    try {
      if (pdfBlob) {
        const result = await sharePdfBlob(pdfBlob, filename, title);
        if (result === "shared") return;
        if (result === "aborted") return;
        // No native share — fall back to download so user still gets the file.
        downloadPdfBlob(pdfBlob, filename);
        setShareNote("Saved a copy — use Share from your files if needed");
        return;
      }
      if (typeof navigator !== "undefined" && navigator.share && src && !src.startsWith("blob:")) {
        await navigator.share({ title, url: src });
        return;
      }
      if (url) {
        openPdfUrl(url);
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
      data-inline-pdf={inlineOk ? "1" : "0"}
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
        {inlineOk && src ? (
          <iframe
            title={title}
            src={src}
            className="absolute inset-0 w-full h-full border-0 bg-white"
            data-testid="local-doc-frame"
          />
        ) : src || pdfBlob ? (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center"
            data-testid="local-doc-native-panel"
          >
            <div className="w-16 h-16 rounded-2xl bg-white shadow-sm flex items-center justify-center text-3xl" aria-hidden>
              📄
            </div>
            <div>
              <p className="text-base font-extrabold text-slate-900 mb-1">{title}</p>
              <p className="text-sm text-slate-600 max-w-xs mx-auto">
                Your phone opens invoices in its built-in PDF reader — tap Open to view the full document.
              </p>
            </div>
            <button
              type="button"
              className="btn !py-3.5 px-8 bg-brand text-white font-bold text-base rounded-full shadow-md"
              onClick={onNativeOpen}
              data-testid="local-doc-open-native"
            >
              Open invoice
            </button>
            <p className="text-xs text-slate-500">Or use Download / Share above</p>
          </div>
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
        {!inlineOk ? (
          <button
            type="button"
            className="btn flex-1 !py-3 bg-brand text-white font-semibold"
            onClick={onNativeOpen}
            data-testid="local-doc-open-native-footer"
          >
            Open invoice
          </button>
        ) : (
          <button
            type="button"
            className="btn flex-1 !py-3 bg-brand-soft text-brand font-semibold"
            onClick={onDownload}
            data-testid="local-doc-download-footer"
          >
            Download
          </button>
        )}
      </div>
    </div>
  );
}
