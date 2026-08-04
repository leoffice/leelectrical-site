// Check photo attach for public pay page: Upload, Take picture, auto-snap when clear.
import React, { useEffect, useRef, useState } from "react";

/**
 * Rough "whole check in frame" score from a video frame.
 * High contrast + not washed + enough edges (MICR/print) + not tiny subject.
 */
export function scoreCheckFrame(ctx, w, h) {
  if (!ctx || w < 8 || h < 8) return 0;
  try {
    const sw = Math.min(w, 160);
    const sh = Math.min(h, 100);
    const img = ctx.getImageData(0, 0, sw, sh);
    const d = img.data;
    let bright = 0;
    let dark = 0;
    let edge = 0;
    let n = 0;
    let sum = 0;
    for (let y = 1; y < sh - 1; y += 2) {
      for (let x = 1; x < sw - 1; x += 2) {
        const i = (y * sw + x) * 4;
        const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        sum += lum;
        n += 1;
        if (lum > 242) bright += 1;
        if (lum < 40) dark += 1;
        const right = 0.299 * d[i + 4] + 0.587 * d[i + 5] + 0.114 * d[i + 6];
        const down =
          0.299 * d[i + sw * 4] + 0.587 * d[i + sw * 4 + 1] + 0.114 * d[i + sw * 4 + 2];
        if (Math.abs(lum - right) > 28 || Math.abs(lum - down) > 28) edge += 1;
      }
    }
    if (!n) return 0;
    const wash = bright / n;
    const ink = dark / n;
    const edgeRate = edge / n;
    const mean = sum / n;
    // Want: some ink, not pure white wash, decent edges, mid brightness.
    if (wash > 0.88) return 0.05;
    if (edgeRate < 0.04) return 0.1;
    let score = 0;
    score += Math.min(1, edgeRate / 0.18) * 0.45;
    score += Math.min(1, ink / 0.04) * 0.2;
    score += (1 - wash) * 0.2;
    // Prefer landscape check-ish mean brightness (paper-ish)
    score += mean > 120 && mean < 230 ? 0.15 : 0.05;
    return Math.max(0, Math.min(1, score));
  } catch {
    return 0;
  }
}

/**
 * @param {{
 *   disabled?: boolean,
 *   busy?: boolean,
 *   file?: File | null,
 *   previewUrl?: string,
 *   onFile: (file: File) => void,
 *   testId?: string,
 * }} props
 */
export default function CheckPhotoCapture({
  disabled,
  busy,
  file,
  previewUrl,
  onFile,
  testId = "pay-check",
}) {
  const uploadRef = useRef(null);
  const cameraRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [camErr, setCamErr] = useState("");
  const [readyScore, setReadyScore] = useState(0);
  const [autoReady, setAutoReady] = useState(false);
  const [frozenUrl, setFrozenUrl] = useState("");
  const [frozenBlob, setFrozenBlob] = useState(null);
  const goodFrames = useRef(0);

  const stopStream = () => {
    try {
      streamRef.current?.getTracks?.().forEach((t) => t.stop());
    } catch {
      /* ignore */
    }
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  useEffect(() => () => stopStream(), []);

  const closeCamera = () => {
    stopStream();
    setCameraOpen(false);
    setCamErr("");
    setReadyScore(0);
    setAutoReady(false);
    goodFrames.current = 0;
    if (frozenUrl) {
      try {
        URL.revokeObjectURL(frozenUrl);
      } catch {
        /* ignore */
      }
    }
    setFrozenUrl("");
    setFrozenBlob(null);
  };

  const openCamera = async () => {
    if (disabled || busy) return;
    setCamErr("");
    setCameraOpen(true);
    setAutoReady(false);
    goodFrames.current = 0;
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera not available — use Upload instead");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        await v.play().catch(() => {});
      }
    } catch (e) {
      setCamErr(String((e && e.message) || "Could not open camera"));
    }
  };

  // Score frames; auto-freeze when clear enough for several ticks.
  useEffect(() => {
    if (!cameraOpen || frozenBlob) return undefined;
    let alive = true;
    const canvas = document.createElement("canvas");
    const tick = () => {
      if (!alive) return;
      const v = videoRef.current;
      if (!v || v.readyState < 2 || v.videoWidth < 32) return;
      const w = v.videoWidth;
      const h = v.videoHeight;
      canvas.width = Math.min(w, 480);
      canvas.height = Math.round((canvas.width / w) * h);
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      const score = scoreCheckFrame(ctx, canvas.width, canvas.height);
      setReadyScore(score);
      if (score >= 0.62) {
        goodFrames.current += 1;
      } else {
        goodFrames.current = Math.max(0, goodFrames.current - 1);
      }
      // ~5 consecutive good samples at 250ms ≈ 1.25s of clear view
      if (goodFrames.current >= 5 && !frozenBlob) {
        canvas.toBlob(
          (blob) => {
            if (!alive || !blob) return;
            const url = URL.createObjectURL(blob);
            setFrozenBlob(blob);
            setFrozenUrl(url);
            setAutoReady(true);
            stopStream();
          },
          "image/jpeg",
          0.92
        );
      }
    };
    const id = setInterval(tick, 250);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [cameraOpen, frozenBlob]);

  const acceptFrozen = () => {
    if (!frozenBlob) return;
    const f = new File([frozenBlob], `check-${Date.now()}.jpg`, { type: "image/jpeg" });
    onFile?.(f);
    closeCamera();
  };

  const manualSnap = () => {
    const v = videoRef.current;
    if (!v || v.videoWidth < 32) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        setFrozenBlob(blob);
        setFrozenUrl(url);
        setAutoReady(true);
        stopStream();
      },
      "image/jpeg",
      0.92
    );
  };

  const onUpload = (e) => {
    const f = e.target.files?.[0];
    if (f) onFile?.(f);
    e.target.value = "";
  };

  const onCameraFile = (e) => {
    // Fallback for browsers that don't support live getUserMedia well
    const f = e.target.files?.[0];
    if (f) onFile?.(f);
    e.target.value = "";
  };

  return (
    <div className="space-y-2" data-testid={`${testId}-photo`}>
      <input
        ref={uploadRef}
        type="file"
        accept="image/*,application/pdf"
        className="sr-only"
        data-testid={`${testId}-file`}
        onChange={onUpload}
        disabled={disabled || busy}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        data-testid={`${testId}-camera-file`}
        onChange={onCameraFile}
        disabled={disabled || busy}
      />
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-700 font-semibold"
          data-testid={`${testId}-upload`}
          onClick={() => uploadRef.current?.click()}
          disabled={disabled || busy}
        >
          📁 Upload picture
        </button>
        <button
          type="button"
          className="rounded-xl border border-dashed border-brand/40 bg-brand-soft/30 px-3 py-3 text-sm text-slate-800 font-semibold"
          data-testid={`${testId}-camera`}
          onClick={() => void openCamera()}
          disabled={disabled || busy}
        >
          📷 Take picture
        </button>
      </div>
      {file || previewUrl ? (
        <div
          className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2 flex items-center gap-3"
          data-testid={`${testId}-preview`}
        >
          {previewUrl ? (
            <img src={previewUrl} alt="Check" className="w-14 h-10 object-cover rounded-md border border-slate-200" />
          ) : (
            <span className="text-lg" aria-hidden>
              📎
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-slate-800 truncate">
              {file?.name || "Check photo attached"}
            </p>
            <p className="text-[11px] text-emerald-700">Ready — we read the numbers automatically</p>
          </div>
        </div>
      ) : null}

      {cameraOpen ? (
        <div
          className="fixed inset-0 z-[60] bg-slate-900/80 flex items-end sm:items-center justify-center p-3"
          role="dialog"
          aria-modal="true"
          aria-label="Scan check"
          data-testid={`${testId}-camera-modal`}
        >
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-xl">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-sm">Scan check</h3>
              <button type="button" className="text-sm text-slate-500 font-semibold" onClick={closeCamera}>
                Close
              </button>
            </div>
            <div className="p-3 space-y-3">
              {camErr ? (
                <div className="space-y-2">
                  <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                    {camErr}
                  </p>
                  <button
                    type="button"
                    className="btn-brand w-full !py-2.5 text-sm"
                    onClick={() => cameraRef.current?.click()}
                  >
                    Use phone camera instead
                  </button>
                </div>
              ) : frozenUrl ? (
                <div className="space-y-2" data-testid={`${testId}-auto-snap`}>
                  <img
                    src={frozenUrl}
                    alt="Captured check"
                    className="w-full rounded-xl border border-slate-200 max-h-64 object-contain bg-slate-50"
                  />
                  <p className="text-sm text-emerald-800 font-semibold text-center">
                    {autoReady ? "Clear shot captured — review, then proceed" : "Shot ready — proceed"}
                  </p>
                  <button
                    type="button"
                    className="btn-brand w-full !py-3"
                    data-testid={`${testId}-proceed`}
                    onClick={acceptFrozen}
                  >
                    Proceed
                  </button>
                  <button
                    type="button"
                    className="btn-ghost w-full !py-2 text-sm"
                    onClick={() => {
                      if (frozenUrl) {
                        try {
                          URL.revokeObjectURL(frozenUrl);
                        } catch {
                          /* ignore */
                        }
                      }
                      setFrozenUrl("");
                      setFrozenBlob(null);
                      setAutoReady(false);
                      goodFrames.current = 0;
                      void openCamera();
                    }}
                  >
                    Retake
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative rounded-xl overflow-hidden bg-black aspect-[16/10]">
                    <video
                      ref={videoRef}
                      className="w-full h-full object-cover"
                      playsInline
                      muted
                      autoPlay
                    />
                    <div className="absolute inset-3 border-2 border-dashed border-white/70 rounded-lg pointer-events-none" />
                    <div className="absolute bottom-2 left-2 right-2 flex justify-between items-center text-[11px] text-white font-semibold drop-shadow">
                      <span>Fit the whole check in the frame</span>
                      <span data-testid={`${testId}-clarity`}>
                        {readyScore >= 0.62 ? "Looking clear…" : "Hold steady…"}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-brand w-full !py-3"
                    data-testid={`${testId}-manual-snap`}
                    onClick={manualSnap}
                  >
                    Capture now
                  </button>
                  <p className="text-[11px] text-slate-500 text-center leading-relaxed">
                    When the whole check is clear, we take the shot for you — then you tap Proceed.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
