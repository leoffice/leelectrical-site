// Floating Dispatch chat — bubble on every view, gradient panel, removable
// context chip, Web Speech mic with level animation, message statuses,
// unread badge. Posts to the chat fn (op:msg) + iterate fn; polls ~5s.
// Also sends presence heartbeats (op:presence) so Dispatch knows we're online.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useStore } from "../state/store.jsx";
import { fmt$ } from "../lib/format.js";

const CONVO_KEY = "le_pro_convo";

/** The chat fn stores bubble messages as who:"you" and Dispatch replies as
 *  who:"claude" (op:reply) — some tools use "dispatch". Anything that isn't
 *  a reply renders as "me". */
const isDispatchMsg = (m) => m.who === "dispatch" || m.who === "claude";
function getConvo() {
  try {
    let c = localStorage.getItem(CONVO_KEY);
    if (!c) {
      c = "pro-" + Date.now();
      localStorage.setItem(CONVO_KEY, c);
    }
    return c;
  } catch {
    return "pro-anon";
  }
}

export default function ChatBubble() {
  const { api, effectiveJob, showToast } = useStore();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [unread, setUnread] = useState(0);
  const [text, setText] = useState("");
  const [ctxOn, setCtxOn] = useState(true);
  const [rec, setRec] = useState(false);
  const convo = useRef(getConvo());
  const lastN = useRef(0);
  const openRef = useRef(open);
  openRef.current = open;
  const logRef = useRef(null);
  const recRef = useRef(null);
  const micBtn = useRef(null);

  // Context string from the current view (sleek's chatCtx).
  const jobId = loc.pathname.startsWith("/job/") ? decodeURIComponent(loc.pathname.slice(5)) : null;
  const view = jobId
    ? "detail"
    : loc.pathname === "/"
    ? "jobs"
    : loc.pathname.replace(/^\//, "").split("/")[0] || "jobs";
  const chatCtx = useCallback(() => {
    if (!ctxOn) return "";
    if (jobId) {
      const j = effectiveJob(jobId);
      if (j)
        return `Regarding Job: ${j.customer || ""} [${j.title || ""}${j.invoiceNo ? ", inv " + j.invoiceNo : ""}${
          j.amount ? ", " + fmt$(j.amount) : ""
        }${j.address ? ", " + j.address : ""}] — `;
    }
    if (view === "dev") return "";
    return `[LE Pro / ${view} view] — `;
  }, [ctxOn, jobId, view, effectiveJob]);

  // Optimistically-rendered messages the server hasn't echoed back yet —
  // poll() keeps them visible instead of blinking them away.
  const localMsgs = useRef([]);

  const poll = useCallback(async () => {
    try {
      const ms = await api.chatList(convo.current);
      localMsgs.current = localMsgs.current.filter((lm) => !ms.some((m) => m.id === lm.id));
      if (ms.length > lastN.current && !openRef.current) setUnread((u) => u + ms.length - lastN.current);
      lastN.current = ms.length;
      setMsgs(ms.concat(localMsgs.current));
    } catch {}
  }, [api]);

  useEffect(() => {
    poll();
    const t = setInterval(poll, 5000);
    return () => clearInterval(t);
  }, [poll]);

  // Presence heartbeat — fire-and-forget ping so Dispatch can see the app is
  // open. Fires on: app load, tab becoming visible, chat panel open, and on an
  // interval (45s while the tab is visible, 20s while the panel is open).
  const viewRef = useRef(view);
  viewRef.current = view;
  const presencePing = useCallback(() => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    try {
      api.presence(convo.current, viewRef.current).catch(() => {});
    } catch {}
  }, [api]);

  useEffect(() => {
    presencePing(); // app load
    const onVis = () => {
      if (document.visibilityState === "visible") presencePing();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [presencePing]);

  useEffect(() => {
    if (open) presencePing(); // panel open
    const t = setInterval(presencePing, open ? 20000 : 45000);
    return () => clearInterval(t);
  }, [open, presencePing]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = 99999;
  }, [msgs, open]);

  const toggle = () => {
    setOpen((o) => {
      if (!o) {
        setUnread(0);
        setCtxOn(true);
        poll();
      }
      return !o;
    });
  };

  const send = async () => {
    const t = text.trim();
    if (!t) return;
    setText("");
    const full = chatCtx() + t;
    setCtxOn(true);

    // Optimistic render — shows immediately with status "Sent".
    const msg = { id: "m" + Date.now(), who: "you", text: full, status: "Sent", _local: true };
    localMsgs.current = [...localMsgs.current, msg];
    setMsgs((ms) => [...ms, msg]);

    let ok = false;
    try {
      await api.chatSend(convo.current, msg.id, full);
      ok = true;
    } catch {
      try {
        await api.chatSend(convo.current, msg.id, full); // retry once
        ok = true;
      } catch {}
    }
    if (!ok) {
      showToast("Send failed — check your connection and try again");
      localMsgs.current = localMsgs.current.map((m) =>
        m.id === msg.id ? { ...m, status: "Not sent" } : m
      );
      setMsgs((ms) => ms.map((m) => (m.id === msg.id ? { ...m, status: "Not sent" } : m)));
      return;
    }
    // Nudge Dispatch — a failed nudge must not mark the message unsent.
    api.iterate(full, "pro-bubble:" + convo.current).catch(() => {});
    poll();
  };

  /* mic with level animation (Web Speech API + analyser) */
  const toggleMic = () => {
    if (recRef.current) {
      recRef.current.stop();
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return showToast("Voice input not supported in this browser");
    const r = new SR();
    recRef.current = r;
    r.lang = "en-US";
    r.interimResults = true;
    r.continuous = true;
    setRec(true);
    let audioCtx = null;
    let anim = null;
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          audioCtx = new AudioContext();
          const src = audioCtx.createMediaStreamSource(stream);
          const an = audioCtx.createAnalyser();
          an.fftSize = 256;
          src.connect(an);
          const buf = new Uint8Array(an.frequencyBinCount);
          const loop = () => {
            an.getByteFrequencyData(buf);
            const v = buf.reduce((a, b) => a + b, 0) / buf.length / 255;
            if (micBtn.current) micBtn.current.style.transform = "scale(" + (1 + v * 0.9) + ")";
            anim = requestAnimationFrame(loop);
          };
          loop();
          r._stream = stream;
        })
        .catch(() => {});
    }
    const base = text;
    r.onresult = (e) => {
      let s = "";
      for (const res of e.results) s += res[0].transcript;
      setText((base ? base + " " : "") + s);
    };
    r.onend = () => {
      setRec(false);
      if (micBtn.current) micBtn.current.style.transform = "";
      cancelAnimationFrame(anim);
      if (r._stream) r._stream.getTracks().forEach((t) => t.stop());
      if (audioCtx) audioCtx.close();
      recRef.current = null;
    };
    r.start();
  };

  const ctx = chatCtx();
  const working = msgs.some((m) => m.status === "Working on it");

  return (
    <>
      <button
        onClick={toggle}
        aria-label="Chat with Dispatch"
        data-testid="chat-fab"
        className="fixed z-40 right-4 bottom-36 lg:bottom-6 lg:right-6 w-12 h-12 rounded-full bg-gradient-to-br from-accent to-brand text-white text-xl shadow-xl"
      >
        💬
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-extrabold leading-[18px]">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed z-50 inset-x-2.5 bottom-20 lg:inset-x-auto lg:right-6 lg:bottom-20 lg:w-[400px] max-w-[420px] ml-auto bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[64vh] overflow-hidden"
          data-testid="chat-panel"
        >
          <div className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-accent to-brand text-white">
            <b className="text-sm flex-1">Dispatch</b>
            {working && <span className="text-[11px] opacity-85">working…</span>}
            <button onClick={toggle} className="text-white" aria-label="Close chat">✕</button>
          </div>
          <div ref={logRef} className="flex-1 overflow-y-auto p-3 min-h-[120px]">
            {msgs.length ? (
              msgs.map((m, i) => (
                <div
                  key={m.id || i}
                  className={`max-w-[82%] rounded-2xl px-3 py-2 text-sm mb-2 ${
                    isDispatchMsg(m)
                      ? "bg-slate-100 rounded-bl-md"
                      : "bg-brand text-white ml-auto rounded-br-md"
                  }`}
                >
                  {m.text}
                  <span className="block text-[10px] opacity-70 mt-0.5 text-right">
                    {isDispatchMsg(m) ? "Dispatch" : m.status || "Sent"}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-sm text-slate-400 text-center py-5">
                Say hi — I'm listening. Messages include page context automatically.
              </div>
            )}
          </div>
          {!msgs.some(isDispatchMsg) && (
            <div className="px-3 pb-1 text-[11px] text-slate-400 text-center" data-testid="chat-hint">
              Dispatch usually replies within a couple of minutes
            </div>
          )}
          {ctx && (
            <div className="flex items-center gap-1.5 mx-3 mb-1 text-[11px] font-semibold text-accent bg-accent-soft rounded-lg px-2.5 py-1.5" data-testid="ctx-chip">
              <span className="truncate flex-1">Context: {ctx.replace(/ — $/, "")}</span>
              <button
                onClick={() => {
                  setCtxOn(false);
                  showToast("Context off for this message");
                }}
                aria-label="Remove context"
                className="font-extrabold"
              >
                ✕
              </button>
            </div>
          )}
          <div className="flex items-end gap-2 p-3 border-t border-slate-200">
            <textarea
              className="input flex-1 max-h-[90px] resize-none"
              rows={1}
              placeholder="Message Dispatch…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              aria-label="Chat message"
            />
            <button
              ref={micBtn}
              onClick={toggleMic}
              aria-label="Voice input"
              className={`w-9 h-9 rounded-full text-base shrink-0 transition-transform ${rec ? "bg-red-100" : "bg-slate-100"}`}
            >
              🎤
            </button>
            <button onClick={send} aria-label="Send message" className="w-9 h-9 rounded-full bg-brand text-white shrink-0">
              ➤
            </button>
          </div>
        </div>
      )}
    </>
  );
}
