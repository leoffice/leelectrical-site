// Full-screen in-app PDF viewer — view first, then download / share / close.
// On iPhone/Android/Samsung Fold, iframe blob PDFs show a blank page + UUID;
// use native open on a user tap (auto-open is blocked without a gesture).
// Always portal to document.body so Sheet/modals never clip or undercut the
// viewer on desktop (overflow + transform stacking contexts).
import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
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
  const [openNote, setOpenNote] = useState("");

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

  // No auto-open on mount — phones (esp. Samsung Fold / Android Chrome) block
  // downloads and popups without a user tap. The Open button is the reliable path.

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
    setOpenNote("");
    const result = openPdfForNativeView({ blob: pdfBlob, url: url || src || "", filename });
    if (result === "noop") {
      setOpenNote("Couldn’t open this file — try Download or Share.");
      return;
    }
    setOpenNote("Opening on your device… if nothing appears, tap Download or Share.");
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

  const ui = (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-slate-950"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-testid="local-doc-viewer"
      data-inline-pdf={inlineOk ? "1" : "0"}
      data-portaled="1"
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
      {openNote ? (
        <p className="text-[11px] text-sky-100 bg-sky-950/80 px-3 py-1.5 shrink-0" data-testid="local-doc-open-note">
          {openNote}
        </p>
      ) : null}
      <div className="flex-1 min-h-0 bg-slate-200 relative">
        {inlineOk && src ? (
          <>
            <iframe
              title={title}
              src={src}
              className="absolute inset-0 w-full h-full border-0 bg-white"
              data-testid="local-doc-frame"
            />
            {/* Desktop escape hatch — same center View as phone when iframe is blank/cut off */}
            <div className="absolute bottom-4 left-0 right-0 flex justify-center pointer-events-none px-4">
              <button
                type="button"
                className="pointer-events-auto btn !py-2.5 px-6 bg-slate-900/90 text-white font-bold text-sm rounded-full shadow-lg"
                onClick={onNativeOpen}
                data-testid="local-doc-open-native-desktop"
              >
                View full page
              </button>
            </div>
          </>
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
                Phones and foldables can&apos;t preview PDFs inside the app — tap View to open the full document on this device (works on iPhone and Android).
              </p>
            </div>
            <button
              type="button"
              className="btn !py-3.5 px-8 bg-brand text-white font-bold text-base rounded-full shadow-md"
              onClick={onNativeOpen}
              data-testid="local-doc-open-native"
            >
              View
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
            View
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

  // Portal out of Sheet/modal trees so desktop never clips the viewer.
  if (typeof document !== "undefined" && document.body) {
    return createPortal(ui, document.body);
  }
  return ui;
}
