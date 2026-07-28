// LE contextual voice mic — hidden by default; appears ONLY while a text field
// is focused. Tap to dictate (record → xAI Grok STT → polish → insert into the
// field). No always-on floating bubble.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useStoreData } from "../state/store.jsx";
import { useAppSettings } from "../lib/appSettings.js";
import {
  audioCaptureSupported,
  getLastTextTarget,
  insertTextAtFocus,
  pickAudioMimeType,
  polishVoiceTextSmart,
  setLastTextTarget,
  subscribeTextFocus,
  transcribeAudioBlob,
} from "../lib/voiceFlow.js";

// Keep the field focused when the mic UI is touched so it stays visible and the
// transcript lands in the right place.
function holdFocus(e) {
  e.preventDefault();
}

// Anchor the mic just above the mobile keyboard (visualViewport) / bottom-right
// on desktop. Recomputed on viewport + orientation changes.
function useKeyboardSafeBottom() {
  const [bottom, setBottom] = useState(24);
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    const compute = () => {
      if (!vv) return setBottom(24);
      const overlap = window.innerHeight - (vv.height + vv.offsetTop);
      setBottom(Math.max(16, overlap + 12));
    };
    compute();
    if (vv) {
      vv.addEventListener("resize", compute);
      vv.addEventListener("scroll", compute);
    }
    window.addEventListener("orientationchange", compute);
    return () => {
      if (vv) {
        vv.removeEventListener("resize", compute);
        vv.removeEventListener("scroll", compute);
      }
      window.removeEventListener("orientationchange", compute);
    };
  }, []);
  return bottom;
}

export default function VoiceFlowBubble() {
  const { showToast } = useStoreData();
  const { speechToText } = useAppSettings();
  const [active, setActive] = useState(false); // a text field is focused
  const [phase, setPhase] = useState("idle"); // idle | listening | processing | review
  const [level, setLevel] = useState(0);
  const [preview, setPreview] = useState("");

  const streamRef = useRef(null);
  const animRef = useRef(null);
  const audioCtxRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const insertTargetRef = useRef(null);
  const bottom = useKeyboardSafeBottom();

  const supported = speechToText && audioCaptureSupported();

  // Show the mic only when a text field is focused.
  useEffect(() => {
    if (!supported) return undefined;
    return subscribeTextFocus((field) => {
      setActive(!!field);
      if (!field) {
        // Field left — collapse anything except an in-flight review the user
        // may still want (review keeps focus via data-voice-ui, so field stays).
        setPhase((p) => (p === "review" ? p : "idle"));
      }
    });
  }, [supported]);

  const cleanupAudio = useCallback(() => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    animRef.current = null;
    if (audioCtxRef.current) {
      try {
        audioCtxRef.current.close();
      } catch {
        /* noop */
      }
      audioCtxRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setLevel(0);
  }, []);

  const startMeter = useCallback((stream) => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      audioCtxRef.current = ctx;
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
    } catch {
      /* meter is cosmetic */
    }
  }, []);

  const transcribeAndReview = useCallback(async () => {
    const chunks = chunksRef.current;
    chunksRef.current = [];
    cleanupAudio();
    const mime = recorderRef.current?.mimeType || pickAudioMimeType() || "audio/webm";
    recorderRef.current = null;
    if (!chunks.length) {
      setPhase("idle");
      return;
    }
    setPhase("processing");
    const blob = new Blob(chunks, { type: mime });
    const res = await transcribeAudioBlob(blob);
    if (!res.ok || !res.text) {
      setPhase("idle");
      if (res.dryRun) showToast?.("Voice not configured yet (XAI_API_KEY)");
      else showToast?.(res.error ? "Couldn't transcribe — try again" : "Didn't catch that — try again");
      return;
    }
    let polished = res.text;
    try {
      polished = await polishVoiceTextSmart(res.text);
    } catch {
      /* keep raw transcript */
    }
    setPreview(polished || res.text);
    setPhase("review");
  }, [cleanupAudio, showToast]);

  const startListening = useCallback(
    (e) => {
      holdFocus(e);
      insertTargetRef.current = getLastTextTarget();
      setPreview("");
      chunksRef.current = [];
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          streamRef.current = stream;
          const mimeType = pickAudioMimeType();
          let rec;
          try {
            rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
          } catch {
            rec = new MediaRecorder(stream);
          }
          recorderRef.current = rec;
          rec.ondataavailable = (ev) => {
            if (ev.data && ev.data.size) chunksRef.current.push(ev.data);
          };
          rec.onstop = () => {
            transcribeAndReview();
          };
          rec.start();
          setPhase("listening");
          startMeter(stream);
        })
        .catch(() => {
          cleanupAudio();
          setPhase("idle");
          showToast?.("Microphone blocked — allow mic access");
        });
    },
    [cleanupAudio, showToast, startMeter, transcribeAndReview]
  );

  const stopListening = useCallback((e) => {
    if (e) holdFocus(e);
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") {
      try {
        rec.stop(); // onstop → transcribeAndReview
      } catch {
        /* noop */
      }
    }
  }, []);

  const cancelAll = useCallback(
    (e) => {
      if (e) holdFocus(e);
      const rec = recorderRef.current;
      if (rec && rec.state !== "inactive") {
        rec.onstop = null;
        try {
          rec.stop();
        } catch {
          /* noop */
        }
      }
      recorderRef.current = null;
      chunksRef.current = [];
      cleanupAudio();
      setPreview("");
      setPhase("idle");
    },
    [cleanupAudio]
  );

  const confirmInsert = useCallback(
    async (e) => {
      holdFocus(e);
      const text = preview.trim();
      if (!text) {
        cancelAll();
        return;
      }
      const target = insertTargetRef.current || getLastTextTarget();
      if (target) setLastTextTarget(target);
      const ok = insertTextAtFocus(text, target);
      setPreview("");
      setPhase("idle");
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

  // Teardown on unmount.
  useEffect(
    () => () => {
      const rec = recorderRef.current;
      if (rec && rec.state !== "inactive") {
        rec.onstop = null;
        try {
          rec.stop();
        } catch {
          /* noop */
        }
      }
      cleanupAudio();
    },
    [cleanupAudio]
  );

  // Disabled or unsupported → render nothing (hard hide).
  if (!supported) return null;
  // Hidden by default: only show while a field is focused or a flow is running.
  if (!active && phase === "idle") return null;

  const scale = 1 + level * 0.3;
  const expanded = phase === "listening" || phase === "processing" || phase === "review";

  return (
    <div
      data-voice-ui
      data-testid="voice-flow-bubble"
      className="fixed z-[9999] right-3 lg:right-6 flex flex-col items-end gap-2 pointer-events-none"
      style={{ bottom }}
      onPointerDown={holdFocus}
    >
      {expanded ? (
        <div
          data-voice-ui
          data-testid="voice-flow-expanded"
          className="pointer-events-auto flex flex-col gap-2 bg-slate-900/95 backdrop-blur-md border border-slate-600 rounded-2xl shadow-2xl px-3 py-2.5 max-w-[min(84vw,320px)] text-white"
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

          {phase === "processing" ? (
            <p className="text-xs text-emerald-300" data-testid="voice-flow-polishing">
              {preview ? "Adding…" : "Transcribing…"}
            </p>
          ) : null}

          {phase === "review" ? (
            <textarea
              className="w-full min-h-[72px] text-sm bg-slate-800 text-white border border-slate-600 rounded-xl px-2.5 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-400"
              style={{
                unicodeBidi: "plaintext",
                maxHeight: "min(40vh, 200px)",
                overflowY: "auto",
                WebkitOverflowScrolling: "touch",
              }}
              value={preview}
              onChange={(e) => setPreview(e.target.value)}
              aria-label="Transcribed voice text"
              data-testid="voice-flow-preview"
            />
          ) : null}

          {phase === "listening" || phase === "review" ? (
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
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {phase !== "review" ? (
        <button
          type="button"
          aria-label={phase === "listening" ? "Done — transcribe" : "Dictate into this field"}
          className="pointer-events-auto w-12 h-12 rounded-full shadow-2xl border-2 border-emerald-400 flex items-center justify-center overflow-hidden transition-transform active:scale-95"
          style={{
            transform: phase === "listening" ? `scale(${scale})` : undefined,
            background: phase === "idle" ? "rgba(15,23,42,0.95)" : "#059669",
          }}
          onPointerDown={holdFocus}
          onClick={
            phase === "listening" ? stopListening : phase === "idle" ? startListening : undefined
          }
          disabled={phase === "processing"}
          data-testid="voice-flow-main"
        >
          {phase === "listening" ? (
            <span className="text-white text-xl font-bold" data-testid="voice-flow-check">
              ✓
            </span>
          ) : phase === "processing" ? (
            <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          ) : (
            <MicIcon />
          )}
        </button>
      ) : null}
    </div>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" fill="#34d399" />
      <path
        d="M6 11a6 6 0 0 0 12 0M12 17v3.5M8.5 20.5h7"
        stroke="#34d399"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
