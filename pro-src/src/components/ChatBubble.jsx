// Floating Dispatch chat — bubble on every view, gradient panel, removable
// context chip, Web Speech mic with level animation, message statuses,
// unread badge. Posts to the chat fn (op:msg) + iterate fn; polls 5s closed,
// 3s while the panel is open. Sends presence heartbeats (op:presence) and
// reads the presence map back to show "Dispatch • online" (the responder cron
// pings convo "dispatch-heartbeat"). Dispatch replies fire a browser
// Notification when the tab is hidden (permission asked on first open).
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useStore } from "../state/store.jsx";
import { fmt$ } from "../lib/format.js";
import { appointmentContextFromRoute } from "../lib/appointmentContext.js";
import { CHAT_SLASH_HINT, jobPatchFromSlash, parseChatSlash } from "../lib/chatActions.js";
import ChatJobUpdateSheet from "./ChatJobUpdateSheet.jsx";

const CONVO_KEY = "le_pro_convo";
const ONLINE_MS = 4 * 60_000; // dispatch-heartbeat (or last reply) younger than this = online
const STUCK_MS = 90_000; // a "Working on it" we've watched longer than this stops looking like a live spinner
const NEAR_BOTTOM_PX = 48; // within this distance of the bottom we auto-scroll on new messages

/** Own-message delivery status → user-facing label. Statuses arrive on the
 *  message object from the chat fn (Sent -> Received -> Read -> Working on it). */
function statusLabel(s) {
  switch (s) {
    case "Read":
      return "Read ✓✓";
    case "Received":
      return "Delivered ✓";
    case "Working on it":
      return "Working on it…";
    case "Not sent":
      return "Not sent";
    default:
      return s || "Sent";
  }
}

/** Ask for Notification permission once (no-op where unsupported/decided). */
function askNotifyPermission() {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "default") return;
    const p = Notification.requestPermission(() => {});
    if (p && p.catch) p.catch(() => {});
  } catch {}
}

/** Browser notification for a Dispatch reply that arrived while tab hidden. */
function notifyReply(m) {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const n = new Notification("Dispatch replied", {
      body: String((m && m.text) || "New message").slice(0, 160),
      tag: "le-pro-dispatch", // collapse repeats into one
    });
    n.onclick = () => {
      try {
        window.focus();
        n.close();
      } catch {}
    };
  } catch {}
}

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
  const { api, effectiveJob, showToast, dirtyCount, jobs, patchJob, addDevTask, setNewJob } = useStore();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [unread, setUnread] = useState(0);
  const [text, setText] = useState("");
  const [ctxOn, setCtxOn] = useState(true);
  const [rec, setRec] = useState(false);
  const [dispatchSeen, setDispatchSeen] = useState(0); // responder heartbeat ts
  const [jobSheet, setJobSheet] = useState(false);
  const convo = useRef(getConvo());
  const lastN = useRef(0);
  const lastDispatchN = useRef(null); // null = not baselined yet (first poll)
  const openRef = useRef(open);
  openRef.current = open;
  const logRef = useRef(null);
  const stickRef = useRef(true); // auto-scroll only while the user is near the bottom
  const recRef = useRef(null);
  const micBtn = useRef(null);
  const workingSince = useRef({ id: null, t: 0 }); // when we first saw the current "Working on it"

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
      // Unread + notifications track DISPATCH replies only (own sends don't
      // count), and the very first poll just baselines old history.
      const dispatch = ms.filter(isDispatchMsg);
      // NB: capture the delta NOW — the setUnread updater runs after the ref
      // is overwritten below (the old code read the ref inside the updater,
      // which made the delta 0 and the badge never increment).
      const fresh = lastDispatchN.current === null ? 0 : dispatch.length - lastDispatchN.current;
      if (fresh > 0) {
        if (!openRef.current) setUnread((u) => u + fresh);
        if (typeof document !== "undefined" && document.visibilityState === "hidden")
          notifyReply(dispatch[dispatch.length - 1]);
      }
      lastDispatchN.current = dispatch.length;
      lastN.current = ms.length;
      setMsgs(ms.concat(localMsgs.current));
    } catch {}
  }, [api]);

  // 3s while the panel is open (live conversation), 5s in the background.
  useEffect(() => {
    poll();
    const t = setInterval(poll, open ? 3000 : 5000);
    return () => clearInterval(t);
  }, [poll, open]);

  // Responder presence — is Dispatch's cron alive? Checked on open + every
  // 15s while the panel stays open (the 3s message poll re-renders, so the
  // <4 min freshness window re-evaluates without its own timer).
  const pollPresence = useCallback(async () => {
    try {
      const map = (api.presenceMap && (await api.presenceMap())) || {};
      const d = map["dispatch-heartbeat"];
      setDispatchSeen((d && d.lastSeen) || 0);
    } catch {}
  }, [api]);

  useEffect(() => {
    if (!open) return;
    pollPresence();
    const t = setInterval(pollPresence, 15000);
    return () => clearInterval(t);
  }, [open, pollPresence]);

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

  const scrollLogToBottom = useCallback(() => {
    const el = logRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  const onLogScroll = useCallback(() => {
    const el = logRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX;
  }, []);

  // Auto-scroll when the panel opens or when new messages arrive — but only if
  // the user hasn't scrolled up to read history (poll every 3s was yanking them
  // back to the bottom).
  useEffect(() => {
    if (!open || !stickRef.current) return;
    requestAnimationFrame(scrollLogToBottom);
  }, [msgs, open, scrollLogToBottom]);

  const apptCtx = appointmentContextFromRoute(loc.pathname, { effectiveJob, jobs });
  const activeJob = jobId ? effectiveJob(jobId) : null;

  const submitDevTask = useCallback(
    async (desc) => {
      const d = String(desc || "").trim();
      if (!d) {
        setText("/task ");
        showToast("Describe the dev task");
        return;
      }
      const ok = await addDevTask({
        title: "",
        desc: d,
        images: [],
        priority: "Normal",
        category: "build",
        target: { pro: true, sleek: false, beta: false, dashboard: false },
      });
      if (ok !== false) setText("");
      return true;
    },
    [addDevTask, showToast]
  );

  const openAppointment = useCallback(() => {
    setNewJob({ step: "appt", context: apptCtx || activeJob || null });
    showToast("Add appointment");
  }, [setNewJob, apptCtx, activeJob, showToast]);

  const runSlash = useCallback(
    async (slash) => {
      if (slash.cmd === "task") return !!(await submitDevTask(slash.rest));
      if (slash.cmd === "appt" || slash.cmd === "appointment") {
        openAppointment();
        return true;
      }
      if (slash.cmd === "job") {
        if (!jobId) {
          showToast("Open a job first — /job only works on job detail");
          return true;
        }
        const patch = jobPatchFromSlash(slash.rest);
        if (!patch) {
          showToast("Try /job notes … · /job followup … · /job phone …");
          return true;
        }
        patchJob(jobId, patch);
        showToast("Job updated — tap Save when ready");
        return true;
      }
      return false;
    },
    [submitDevTask, openAppointment, jobId, patchJob, showToast]
  );

  const toggle = () => {
    setOpen((o) => {
      if (!o) {
        stickRef.current = true;
        setUnread(0);
        setCtxOn(true);
        askNotifyPermission(); // once — no-op after granted/denied
        poll();
      }
      return !o;
    });
  };

  const send = async () => {
    const t = text.trim();
    if (!t) return;
    const slash = parseChatSlash(t);
    if (slash) {
      setText("");
      const handled = await runSlash(slash);
      if (handled) return;
    }
    setText("");
    stickRef.current = true;
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
    api
      .iterate(full, "pro-bubble:" + convo.current, {
        view,
        jobId: jobId || "",
        pathname: loc.pathname,
      })
      .catch(() => {});
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
  const now = Date.now();

  // Liveness — a recent Dispatch REPLY is proof the responder is alive even when
  // its presence heartbeat lags (the "dispatch-heartbeat" cron pings slowly, so
  // relying on it alone left the header stuck on "away" while replies flowed in
  // seconds). Online = fresh heartbeat OR a reply within the same window.
  const lastReplyTs = msgs.reduce((mx, m) => (isDispatchMsg(m) && m.ts > mx ? m.ts : mx), 0);
  const online =
    (dispatchSeen > 0 && now - dispatchSeen < ONLINE_MS) ||
    (lastReplyTs > 0 && now - lastReplyTs < ONLINE_MS);

  // The message Dispatch is actively handling. We time staleness from when WE
  // first observed it "Working on it" (not the message ts — resilient to clock
  // skew), so a long-running reply softens the spinner copy instead of looking
  // frozen forever.
  const workingMsg = msgs.find((m) => m.status === "Working on it");
  const working = !!workingMsg;
  if (working) {
    if (workingSince.current.id !== workingMsg.id) workingSince.current = { id: workingMsg.id, t: now };
  } else if (workingSince.current.id) {
    workingSince.current = { id: null, t: 0 };
  }
  const workingStale = working && now - workingSince.current.t > STUCK_MS;

  return (
    <>
      <button
        onClick={toggle}
        aria-label="Chat with Dispatch"
        data-testid="chat-fab"
        className={`fixed z-40 right-4 lg:right-6 w-12 h-12 rounded-full bg-brand text-white text-xl shadow-xl ${
          dirtyCount ? "bottom-[210px] lg:bottom-24" : "bottom-36 lg:bottom-6" // clear the SaveBar
        }`}
      >
        💬
        {unread > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 flex items-center justify-center"
            data-testid="chat-unread-dot"
            aria-label={`${unread} new ${unread === 1 ? "reply" : "replies"} from Dispatch`}
          >
            <span className="absolute inline-flex w-full h-full rounded-full bg-red-500 opacity-75 animate-ping" />
            <span className="relative inline-flex min-w-[16px] h-[16px] px-1 rounded-full bg-red-600 text-white text-[10px] font-extrabold leading-[16px] items-center justify-center">
              {unread > 9 ? "9+" : unread}
            </span>
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed z-50 inset-x-2.5 bottom-20 lg:inset-x-auto lg:right-6 lg:bottom-20 lg:w-[400px] max-w-[420px] ml-auto bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[64vh] overflow-hidden"
          data-testid="chat-panel"
        >
          <div className="flex items-center gap-2 px-4 py-2.5 bg-brand text-white">
            <div className="flex-1 min-w-0">
              <b className="block text-sm leading-tight">Dispatch</b>
              <span className="flex items-center gap-1.5 text-[11px] opacity-90 leading-tight" data-testid="presence-line">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${online ? "bg-emerald-300" : "bg-white/40"}`} />
                {online ? "online" : "away — replies in a few minutes"}
              </span>
            </div>
            {working && <span className="text-[11px] opacity-85 shrink-0">working…</span>}
            <button onClick={toggle} className="text-white" aria-label="Close chat">✕</button>
          </div>
          <div
            ref={logRef}
            data-testid="chat-log"
            onScroll={onLogScroll}
            className="flex-1 overflow-y-auto p-3 min-h-[120px]"
          >
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
                  <span className="block text-[10px] opacity-70 mt-0.5 text-right" data-testid="msg-meta">
                    {isDispatchMsg(m) ? "Dispatch" : statusLabel(m.status)}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-sm text-slate-400 text-center py-5">
                Say hi — I'm listening. Messages include page context automatically.
              </div>
            )}
            {working && (
              <div
                className="max-w-[82%] rounded-2xl rounded-bl-md bg-slate-100 px-3 py-2 text-sm text-slate-500 mb-2 flex items-center gap-1.5"
                data-testid="typing-line"
              >
                <span className={`w-1.5 h-1.5 rounded-full bg-slate-400 ${workingStale ? "" : "animate-pulse"}`} />
                {workingStale
                  ? "Dispatch is still on it — this one's taking a little longer."
                  : "Dispatch is working on it…"}
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
          <div className="flex gap-1.5 px-3 pb-1 overflow-x-auto" data-testid="chat-actions">
            <button
              type="button"
              className="shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700"
              onClick={() => submitDevTask(text)}
              data-testid="chat-action-task"
            >
              Dev task
            </button>
            {activeJob && (
              <button
                type="button"
                className="shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700"
                onClick={() => setJobSheet(true)}
                data-testid="chat-action-job"
              >
                Update job
              </button>
            )}
            {(apptCtx || activeJob) && (
              <button
                type="button"
                className="shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700"
                onClick={openAppointment}
                data-testid="chat-action-appt"
              >
                Appointment
              </button>
            )}
          </div>
          <div className="px-3 pb-1 text-[10px] text-slate-400" data-testid="chat-slash-hint">
            {CHAT_SLASH_HINT}
          </div>
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
      {jobSheet && activeJob && <ChatJobUpdateSheet job={activeJob} onClose={() => setJobSheet(false)} />}
    </>
  );
}
