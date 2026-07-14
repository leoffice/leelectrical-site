// Wispr-style LE voice bubble — floats above the app, inserts polished text into any field.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "../state/store.jsx";
import {
  getLastTextTarget,
  insertTextAtFocus,
  polishVoiceText,
  setLastTextTarget,
  speechRecognitionSupported,
  trackVoiceFocus,
} from "../lib/voiceFlow.js";

const LOGO = import.meta.env.BASE_URL + "le-logo.png?v=5";

export default function VoiceFlowBubble() {
  const { showToast } = useStore();
  const [phase, setPhase] = useState("idle"); // idle | listening | review | processing
  const [level, setLevel] = useState(0);
  const [rawTranscript, setRawTranscript] = useState("");
  const [preview, setPreview] = useState("");
  const recRef = useRef(null);
  const streamRef = useRef(null);
  const animRef = useRef(null);
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
    if (recRef.current) {
      try {
        recRef.current.stop();
      } catch {}
      recRef.current = null;
    }
    cleanupAudio();
  }, [cleanupAudio]);

  const startListening = useCallback(
    (e) => {
      e?.preventDefault?.();
      insertTargetRef.current = getLastTextTarget();
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) {
        showToast?.("Voice input needs Chrome on Android");
        return;
      }
      if (recRef.current) {
        stopListening();
        setPhase("idle");
        setRawTranscript("");
        return;
      }
      const r = new SR();
      recRef.current = r;
      r.lang = "en-US";
      r.interimResults = true;
      r.continuous = true;
      setRawTranscript("");
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
              const v = buf.reduce((a, b) => a + b, 0) / buf.length / 255;
              setLevel(v);
              animRef.current = requestAnimationFrame(loop);
            };
            loop();
            r._audioCtx = ctx;
          })
          .catch(() => {});
      }

      r.onresult = (ev) => {
        let s = "";
        for (const res of ev.results) s += res[0].transcript;
        setRawTranscript(s);
      };
      r.onerror = () => {
        stopListening();
        setPhase("idle");
      };
      r.onend = () => {
        cleanupAudio();
        if (r._audioCtx) r._audioCtx.close();
        recRef.current = null;
      };
      try {
        r.start();
      } catch {
        stopListening();
        setPhase("idle");
        showToast?.("Could not start microphone");
      }
    },
    [cleanupAudio, showToast, stopListening]
  );

  const finishListening = useCallback(
    (e) => {
      e?.preventDefault?.();
      stopListening();
      const raw = rawTranscript.trim();
      if (!raw) {
        setPhase("idle");
        showToast?.("Didn't catch that — try again");
        return;
      }
      setPreview(polishVoiceText(raw));
      setPhase("review");
    },
    [rawTranscript, stopListening, showToast]
  );

  const cancelAll = useCallback(
    (e) => {
      e?.preventDefault?.();
      stopListening();
      setPhase("idle");
      setRawTranscript("");
      setPreview("");
    },
    [stopListening]
  );

  const confirmInsert = useCallback(
    async (e) => {
      e?.preventDefault?.();
      const text = preview.trim();
      if (!text) {
        cancelAll();
        return;
      }
      setPhase("processing");
      await new Promise((r) => setTimeout(r, 80));
      const target = insertTargetRef.current || getLastTextTarget();
      if (target) setLastTextTarget(target);
      const ok = insertTextAtFocus(text, target);
      setPhase("idle");
      setRawTranscript("");
      setPreview("");
      if (ok) showToast?.("Voice text added");
      else {
        await navigator.clipboard?.writeText(text).catch(() => {});
        showToast?.("Copied — paste into your field");
      }
    },
    [preview, cancelAll, showToast]
  );

  useEffect(() => () => stopListening(), [stopListening]);

  if (!speechRecognitionSupported()) return null;

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
          onMouseDown={(e) => e.preventDefault()}
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
              className="w-full min-h-[88px] max-h-40 text-sm bg-slate-800 text-white border border-slate-600 rounded-xl px-2.5 py-2 resize-y focus:outline-none focus:ring-2 focus:ring-emerald-400"
              value={preview}
              onChange={(e) => setPreview(e.target.value)}
              aria-label="Polished voice text"
              data-testid="voice-flow-preview"
            />
          ) : null}

          {phase === "processing" ? (
            <p className="text-xs text-emerald-300">Polishing…</p>
          ) : null}

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              aria-label="Cancel voice"
              className="px-3 h-8 rounded-full bg-slate-700 text-slate-200 text-xs font-semibold"
              onMouseDown={(e) => e.preventDefault()}
              onClick={cancelAll}
              data-testid="voice-flow-cancel"
            >
              Cancel
            </button>
            {phase === "review" ? (
              <button
                type="button"
                aria-label="Insert voice text"
                className="px-3 h-8 rounded-full bg-emerald-500 text-slate-900 text-xs font-bold"
                onMouseDown={(e) => e.preventDefault()}
                onClick={confirmInsert}
                data-testid="voice-flow-insert"
              >
                Insert
              </button>
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
        onMouseDown={(e) => e.preventDefault()}
        onClick={phase === "listening" ? finishListening : phase === "idle" ? startListening : undefined}
        disabled={phase === "processing" || phase === "review"}
        data-testid="voice-flow-main"
      >
        {phase === "listening" || phase === "processing" ? (
          <span className="text-white text-2xl font-bold" data-testid="voice-flow-check">
            ✓
          </span>
        ) : (
          <img src={LOGO} alt="LE" className="w-10 h-10 object-contain" />
        )}
      </button>
    </div>
  );
}