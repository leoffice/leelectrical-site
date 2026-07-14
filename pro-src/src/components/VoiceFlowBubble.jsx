// Wispr-style LE voice bubble — floats above the app, inserts polished text into any field.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "../state/store.jsx";
import { insertTextAtFocus, polishVoiceText, speechRecognitionSupported } from "../lib/voiceFlow.js";

const LOGO = import.meta.env.BASE_URL + "le-logo.png?v=5";

export default function VoiceFlowBubble() {
  const { showToast } = useStore();
  const [phase, setPhase] = useState("idle"); // idle | listening | processing
  const [level, setLevel] = useState(0);
  const [transcript, setTranscript] = useState("");
  const recRef = useRef(null);
  const streamRef = useRef(null);
  const animRef = useRef(null);
  const baseRef = useRef("");

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
    setPhase("idle");
  }, [cleanupAudio]);

  const startListening = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      showToast?.("Voice input needs Chrome on Android");
      return;
    }
    if (recRef.current) {
      stopListening();
      return;
    }
    const r = new SR();
    recRef.current = r;
    r.lang = "en-US";
    r.interimResults = true;
    r.continuous = true;
    baseRef.current = "";
    setTranscript("");
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

    r.onresult = (e) => {
      let s = "";
      for (const res of e.results) s += res[0].transcript;
      setTranscript(s);
    };
    r.onerror = () => stopListening();
    r.onend = () => {
      cleanupAudio();
      if (r._audioCtx) r._audioCtx.close();
      recRef.current = null;
      setPhase((p) => (p === "listening" ? "idle" : p));
    };
    try {
      r.start();
    } catch {
      stopListening();
      showToast?.("Could not start microphone");
    }
  }, [cleanupAudio, showToast, stopListening]);

  const confirmTranscript = useCallback(async () => {
    stopListening();
    const raw = transcript.trim();
    if (!raw) {
      setPhase("idle");
      return;
    }
    setPhase("processing");
    const polished = polishVoiceText(raw);
    await new Promise((r) => setTimeout(r, 120));
    const ok = insertTextAtFocus(polished);
    setPhase("idle");
    setTranscript("");
    if (ok) showToast?.("Voice text added");
    else showToast?.("Tap a text box first, then use voice");
  }, [stopListening, transcript, showToast]);

  useEffect(() => () => stopListening(), [stopListening]);

  if (!speechRecognitionSupported()) return null;

  const expanded = phase !== "idle";
  const scale = 1 + level * 0.35;

  return (
    <div
      className="fixed z-[65] left-4 bottom-[5.5rem] lg:bottom-6 lg:left-6 flex items-end gap-2 pointer-events-none"
      data-testid="voice-flow-bubble"
    >
      {expanded ? (
        <div
          className="pointer-events-auto flex items-center gap-2 bg-white/90 backdrop-blur-md border border-slate-200 rounded-2xl shadow-xl px-3 py-2 max-w-[min(72vw,280px)]"
          data-testid="voice-flow-expanded"
          style={{ transform: `scale(${Math.max(1, scale * 0.15 + 0.95)})` }}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              {[0, 1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className="w-1 rounded-full bg-brand transition-all duration-75"
                  style={{ height: 4 + level * 22 * (0.6 + (i % 3) * 0.2) }}
                />
              ))}
            </div>
            <p className="text-xs text-slate-600 truncate">{transcript || "Listening…"}</p>
          </div>
          <button
            type="button"
            aria-label="Cancel voice"
            className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 text-sm shrink-0"
            onClick={stopListening}
            data-testid="voice-flow-cancel"
          >
            ✕
          </button>
        </div>
      ) : null}

      <button
        type="button"
        aria-label={phase === "listening" ? "Done — insert voice text" : "LE voice input"}
        className="pointer-events-auto w-12 h-12 rounded-full shadow-xl border-2 border-white flex items-center justify-center overflow-hidden transition-transform active:scale-95"
        style={{
          transform: phase === "listening" ? `scale(${scale})` : undefined,
          background: phase === "processing" ? "#0f172a" : "rgba(255,255,255,0.92)",
        }}
        onClick={() => {
          if (phase === "listening") confirmTranscript();
          else if (phase === "idle") startListening();
        }}
        disabled={phase === "processing"}
        data-testid="voice-flow-main"
      >
        {phase === "listening" || phase === "processing" ? (
          <span className="text-white text-xl font-bold" data-testid="voice-flow-check">
            ✓
          </span>
        ) : (
          <img src={LOGO} alt="LE" className="w-9 h-9 object-contain" />
        )}
      </button>
    </div>
  );
}