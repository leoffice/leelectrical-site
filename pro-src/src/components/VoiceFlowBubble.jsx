// Wispr-style LE voice bubble — floats above the app, inserts polished text into any field.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "../state/store.jsx";
import { useAppSettings } from "../lib/appSettings.js";
import {
  createSilentRecognizer,
  getLastTextTarget,
  insertTextAtFocus,
  polishVoiceTextSmart,
  setLastTextTarget,
  speechRecognitionSupported,
  trackVoiceFocus,
} from "../lib/voiceFlow.js";

const REVIEW_STYLE = {
  unicodeBidi: "plaintext",
  maxHeight: "min(40vh, 200px)",
  overflowY: "auto",
  WebkitOverflowScrolling: "touch",
};

function holdFocus(e) {
  e.preventDefault();
}

export default function VoiceFlowBubble() {
  const { showToast } = useStore();
  const { speechToText, logoSrc } = useAppSettings();
  const [phase, setPhase] = useState("idle");
  const [level, setLevel] = useState(0);
  const [preview, setPreview] = useState("");
  const streamRef = useRef(null);
  const animRef = useRef(null);
  const recognizerRef = useRef(null);
  const insertTargetRef = useRef(null);

  useEffect(() => trackVoiceFocus(), []);

  const cleanupAudio = useCallback(() => {
    cancelAnimationFrame(animRef.current);
    animRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setLevel(0);
  }, []);

  const stopListening = useCallback(() => {
    if (recognizerRef.current) {
      recognizerRef.current.stop();
      recognizerRef.current = null;
    }
    cleanupAudio();
  }, [cleanupAudio]);

  const startListening = useCallback(
    (e) => {
      holdFocus(e);
      insertTargetRef.current = getLastTextTarget();
      if (!speechRecognitionSupported()) {
        showToast?.("Voice input needs Chrome on Android");
        return;
      }
      if (recognizerRef.current) {
        stopListening();
        setPhase("idle");
        return;
      }
      setPreview("");
      setPhase("listening");

      if (navigator.mediaDevices?.getUserMedia) {
        navigator.mediaDevices
          .getUserMedia({ audio: true })
          .then((stream) => {
            streamRef.current = stream;
            const ctx = new AudioContext();
            const src = ctx.createMediaStreamSource(stream);
            const an = ctx.createAnalyser();
            an.fftSize = 256;
            src.connect(an);
            const buf = new Uint8Array(an.frequencyBinCount);
            const loop = () => {
              an.getByteFrequencyData(buf);
              setLevel(buf.reduce((a, b) => a + b, 0) / buf.length / 255);
              animRef.current = requestAnimationFrame(loop);
            };
            loop();
          })
          .catch(() => {});
      }

      recognizerRef.current = createSilentRecognizer({
        lang: "en-US",
        onError: () => {
          stopListening();
          setPhase("idle");
          showToast?.("Microphone error — try again");
        },
        onEnd: () => {
          cleanupAudio();
        },
      });
    },
    [cleanupAudio, showToast, stopListening]
  );

  const finishListening = useCallback(
    async (e) => {
      holdFocus(e);
      const raw = recognizerRef.current?.stop() || "";
      recognizerRef.current = null;
      cleanupAudio();
      if (!raw.trim()) {
        setPhase("idle");
        showToast?.("Didn't catch that — try again");
        return;
      }
      setPhase("processing");
      try {
        const polished = await polishVoiceTextSmart(raw);
        setPreview(polished);
        setPhase("review");
      } catch {
        setPhase("idle");
        showToast?.("Polish failed — try again");
      }
    },
    [cleanupAudio, showToast]
  );

  const cancelAll = useCallback(
    (e) => {
      holdFocus(e);
      stopListening();
      setPhase("idle");
      setPreview("");
    },
    [stopListening]
  );

  const copyPreview = useCallback(
    async (e) => {
      holdFocus(e);
      const text = preview.trim();
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        showToast?.("Copied");
      } catch {
        showToast?.("Select text and copy manually");
      }
    },
    [preview, showToast]
  );

  const confirmInsert = useCallback(
    async (e) => {
      holdFocus(e);
      const text = preview.trim();
      if (!text) {
        cancelAll();
        return;
      }
      setPhase("processing");
      await new Promise((r) => setTimeout(r, 60));
      const target = insertTargetRef.current || getLastTextTarget();
      if (target) setLastTextTarget(target);
      const ok = insertTextAtFocus(text, target);
      setPhase("idle");
      setPreview("");
      if (ok) showToast?.("Voice text added");
      else {
        try {
          await navigator.clipboard.writeText(text);
          showToast?.("Copied — tap your field and paste");
        } catch {
          showToast?.("Couldn't insert — copy from the box");
        }
      }
    },
    [preview, cancelAll, showToast]
  );

  useEffect(() => () => stopListening(), [stopListening]);

  useEffect(() => {
    if (!speechToText) {
      stopListening();
      setPhase("idle");
      setPreview("");
    }
  }, [speechToText, stopListening]);

  if (!speechToText || !speechRecognitionSupported()) return null;

  const scale = 1 + level * 0.35;
  const expanded = phase !== "idle";

  return (
    <div
      className="fixed z-[9999] left-4 bottom-[5.5rem] lg:bottom-6 lg:left-6 flex items-end gap-2 pointer-events-none"
      data-testid="voice-flow-bubble"
    >
      {expanded ? (
        <div
          className="pointer-events-auto flex flex-col gap-2 bg-slate-900/95 backdrop-blur-md border border-slate-600 rounded-2xl shadow-2xl px-3 py-2.5 max-w-[min(84vw,320px)] text-white"
          data-testid="voice-flow-expanded"
          onPointerDown={holdFocus}
        >
          {phase === "listening" ? (
            <>
              <div className="flex items-center gap-1.5 h-6">
                {[0, 1, 2, 3, 4].map((i) => (
                  <span
                    key={i}
                    className="w-1.5 rounded-full bg-emerald-400 transition-all duration-75"
                    style={{ height: 6 + level * 24 * (0.5 + (i % 3) * 0.25) }}
                  />
                ))}
              </div>
              <p className="text-xs text-slate-300">Listening… tap ✓ when done</p>
            </>
          ) : null}

          {phase === "review" ? (
            <textarea
              className="w-full min-h-[72px] text-sm bg-slate-800 text-white border border-slate-600 rounded-xl px-2.5 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-400"
              style={REVIEW_STYLE}
              value={preview}
              onChange={(e) => setPreview(e.target.value)}
              aria-label="Polished voice text"
              data-testid="voice-flow-preview"
            />
          ) : null}

          {phase === "processing" ? (
            <p className="text-xs text-emerald-300" data-testid="voice-flow-polishing">
              {preview ? "Adding…" : "Polishing…"}
            </p>
          ) : null}

          <div className="flex gap-2 justify-end flex-wrap">
            <button
              type="button"
              aria-label="Cancel voice"
              className="px-3 h-8 rounded-full bg-slate-700 text-slate-200 text-xs font-semibold"
              onPointerDown={holdFocus}
              onClick={cancelAll}
              data-testid="voice-flow-cancel"
            >
              Cancel
            </button>
            {phase === "review" ? (
              <>
                <button
                  type="button"
                  aria-label="Copy voice text"
                  className="px-3 h-8 rounded-full bg-slate-600 text-slate-100 text-xs font-semibold"
                  onPointerDown={holdFocus}
                  onClick={copyPreview}
                  data-testid="voice-flow-copy"
                >
                  Copy
                </button>
                <button
                  type="button"
                  aria-label="Insert voice text"
                  className="px-3 h-8 rounded-full bg-emerald-500 text-slate-900 text-xs font-bold"
                  onPointerDown={holdFocus}
                  onClick={confirmInsert}
                  data-testid="voice-flow-insert"
                >
                  Insert
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      <button
        type="button"
        aria-label={phase === "listening" ? "Done listening" : "LE voice input"}
        className="pointer-events-auto w-14 h-14 rounded-full shadow-2xl border-2 border-emerald-400 flex items-center justify-center overflow-hidden transition-transform active:scale-95"
        style={{
          transform: phase === "listening" ? `scale(${scale})` : undefined,
          background: phase === "idle" ? "rgba(15,23,42,0.95)" : "#059669",
        }}
        onPointerDown={holdFocus}
        onClick={phase === "listening" ? finishListening : phase === "idle" ? startListening : undefined}
        disabled={phase === "processing" || phase === "review"}
        data-testid="voice-flow-main"
      >
        {phase === "listening" || phase === "processing" ? (
          <span className="text-white text-2xl font-bold" data-testid="voice-flow-check">
            ✓
          </span>
        ) : (
          <img src={logoSrc} alt="LE" className="w-10 h-10 object-contain" />
        )}
      </button>
    </div>
  );
}