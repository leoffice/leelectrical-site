import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  createSilentRecognizer,
  polishVoiceTextSmart,
  speechRecognitionSupported,
  trackVoiceFocus,
  insertTextAtFocus,
  getLastTextTarget,
  setLastTextTarget,
} from "@voice";

const LOGO = import.meta.env.BASE_URL + "le-logo.png";

const REVIEW_STYLE = {
  unicodeBidi: "plaintext",
  maxHeight: "min(45vh, 220px)",
  overflowY: "auto",
  WebkitOverflowScrolling: "touch",
};

function holdFocus(e) {
  e.preventDefault();
}

export default function App() {
  const [phase, setPhase] = useState("idle");
  const [level, setLevel] = useState(0);
  const [preview, setPreview] = useState("");
  const [toast, setToast] = useState("");
  const [demoText, setDemoText] = useState("");
  const streamRef = useRef(null);
  const animRef = useRef(null);
  const recognizerRef = useRef(null);
  const insertTargetRef = useRef(null);

  useEffect(() => trackVoiceFocus(), []);

  const ping = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2400);
  };

  const cleanupAudio = useCallback(() => {
    cancelAnimationFrame(animRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setLevel(0);
  }, []);

  const stopRec = useCallback(() => {
    if (recognizerRef.current) {
      recognizerRef.current.stop();
      recognizerRef.current = null;
    }
    cleanupAudio();
  }, [cleanupAudio]);

  const start = useCallback(
    (e) => {
      holdFocus(e);
      insertTargetRef.current = getLastTextTarget();
      if (!speechRecognitionSupported()) return ping("Use Chrome on Android for voice");
      if (recognizerRef.current) {
        stopRec();
        setPhase("idle");
        return;
      }
      setPreview("");
      setPhase("listening");

      navigator.mediaDevices?.getUserMedia?.({ audio: true }).then((stream) => {
        streamRef.current = stream;
        const ctx = new AudioContext();
        const an = ctx.createAnalyser();
        an.fftSize = 256;
        ctx.createMediaStreamSource(stream).connect(an);
        const buf = new Uint8Array(an.frequencyBinCount);
        const loop = () => {
          an.getByteFrequencyData(buf);
          setLevel(buf.reduce((a, b) => a + b, 0) / buf.length / 255);
          animRef.current = requestAnimationFrame(loop);
        };
        loop();
      }).catch(() => {});

      recognizerRef.current = createSilentRecognizer({
        lang: "en-US",
        onError: () => {
          stopRec();
          setPhase("idle");
          ping("Microphone error");
        },
        onEnd: () => cleanupAudio(),
      });
    },
    [cleanupAudio, stopRec]
  );

  const finish = useCallback(
    async (e) => {
      holdFocus(e);
      const text = recognizerRef.current?.stop() || "";
      recognizerRef.current = null;
      cleanupAudio();
      if (!text.trim()) {
        setPhase("idle");
        return ping("Try again — nothing heard");
      }
      setPhase("processing");
      try {
        const polished = await polishVoiceTextSmart(text);
        setPreview(polished);
        setPhase("review");
      } catch {
        setPhase("idle");
        ping("Polish failed — try again");
      }
    },
    [cleanupAudio]
  );

  const copyText = useCallback(
    async (e) => {
      holdFocus(e);
      const text = preview.trim();
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        ping("Copied — paste anywhere");
      } catch {
        ping("Select and copy manually");
      }
    },
    [preview]
  );

  const insertText = useCallback(
    (e) => {
      holdFocus(e);
      const text = preview.trim();
      if (!text) return;
      const target = insertTargetRef.current || getLastTextTarget();
      if (target) setLastTextTarget(target);
      const ok = insertTextAtFocus(text, target);
      if (ok) {
        setDemoText((prev) => prev + (prev ? "\n" : "") + text);
        ping("Inserted into your field");
        setPhase("idle");
        setPreview("");
      } else {
        copyText(e);
      }
    },
    [preview, copyText]
  );

  useEffect(() => () => stopRec(), [stopRec]);

  const supported = speechRecognitionSupported();
  const scale = 1 + level * 0.4;

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, gap: 16 }}>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#34d399" }}>LE Flow</h1>
      <p style={{ margin: 0, textAlign: "center", color: "#94a3b8", fontSize: 14, maxWidth: 320 }}>
        Tap the bubble, talk naturally, tap ✓ when done. I rewrite it clean — then insert or copy.
      </p>

      {!supported ? <p style={{ color: "#f87171" }}>Voice needs Chrome on Android.</p> : null}

      <textarea
        placeholder="Tap here first, then dictate — insert lands here"
        value={demoText}
        onChange={(e) => setDemoText(e.target.value)}
        onFocus={() => setLastTextTarget(document.activeElement)}
        style={{
          width: "min(100%, 360px)",
          minHeight: 72,
          maxHeight: 120,
          background: "#1e293b",
          color: "#f8fafc",
          border: "1px solid #475569",
          borderRadius: 12,
          padding: 12,
          fontSize: 15,
          lineHeight: 1.45,
          resize: "vertical",
          unicodeBidi: "plaintext",
        }}
        aria-label="Target field for voice insert"
      />

      {phase === "review" ? (
        <textarea
          value={preview}
          onChange={(e) => setPreview(e.target.value)}
          style={{
            width: "min(100%, 360px)",
            minHeight: 100,
            background: "#1e293b",
            color: "#f8fafc",
            border: "2px solid #34d399",
            borderRadius: 16,
            padding: 12,
            fontSize: 15,
            lineHeight: 1.45,
            resize: "none",
            ...REVIEW_STYLE,
          }}
          aria-label="Polished text"
        />
      ) : phase === "processing" ? (
        <p style={{ color: "#34d399", fontSize: 14 }}>Polishing…</p>
      ) : phase === "listening" ? (
        <div style={{ display: "flex", gap: 4, height: 40, alignItems: "flex-end" }}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <span
              key={i}
              style={{
                width: 6,
                borderRadius: 4,
                background: "#34d399",
                height: 8 + level * 32 * (0.4 + (i % 3) * 0.2),
                transition: "height 75ms",
              }}
            />
          ))}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
        {phase === "review" ? (
          <>
            <button type="button" onPointerDown={holdFocus} onClick={() => { setPhase("idle"); setPreview(""); }} style={btn("#475569")}>
              Cancel
            </button>
            <button type="button" onPointerDown={holdFocus} onClick={copyText} style={btn("#475569")}>
              Copy
            </button>
            <button type="button" onPointerDown={holdFocus} onClick={insertText} style={btn("#059669")}>
              Insert
            </button>
          </>
        ) : null}
      </div>

      <button
        type="button"
        aria-label="Voice bubble"
        onPointerDown={holdFocus}
        onClick={phase === "listening" ? finish : phase === "idle" ? start : undefined}
        disabled={!supported || phase === "review" || phase === "processing"}
        style={{
          width: 88,
          height: 88,
          borderRadius: "50%",
          border: "3px solid #34d399",
          background: phase === "listening" ? "#059669" : "#0f172a",
          boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transform: phase === "listening" ? `scale(${scale})` : undefined,
          cursor: "pointer",
        }}
      >
        {phase === "listening" ? (
          <span style={{ color: "#fff", fontSize: 32, fontWeight: 700 }}>✓</span>
        ) : (
          <img src={LOGO} alt="LE" style={{ width: 56, height: 56, objectFit: "contain" }} />
        )}
      </button>

      {toast ? (
        <p style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#1e293b", border: "1px solid #475569", padding: "8px 16px", borderRadius: 999, margin: 0, fontSize: 13 }}>
          {toast}
        </p>
      ) : null}

      <p style={{ marginTop: 8, fontSize: 12, color: "#64748b", textAlign: "center" }}>
        Install from browser menu → Add to Home Screen
      </p>
    </div>
  );
}

function btn(bg) {
  return {
    background: bg,
    color: "#f8fafc",
    border: "none",
    borderRadius: 999,
    padding: "10px 18px",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
  };
}