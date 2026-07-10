// Floating Israel chat — bubble on every view, gradient panel, removable
// context chip, Web Speech mic with level animation, message statuses,
// unread badge. Posts to the chat fn (op:msg) + iterate fn; polls 5s closed,
// 3s while the panel is open. Sends presence heartbeats (op:presence) and
// reads the presence map back to show "Israel • online" (chat_responder pings
// convo "israel-heartbeat"). Israel replies fire a browser Notification when
// the tab is hidden (permission asked on first open).
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useStore } from "../state/store.jsx";
import { fmt$ } from "../lib/format.js";
import { appointmentContextFromRoute } from "../lib/appointmentContext.js";
import { CHAT_SLASH_HINT, jobPatchFromSlash, parseChatSlash } from "../lib/chatActions.js";
import { buildAgentDraftPatch } from "../lib/invoiceAgentDraft.js";
import { parseInvoiceEditIntent } from "../lib/invoiceEditIntent.js";
import ChatImageActionSheet from "./ChatImageActionSheet.jsx";
import ChatJobUpdateSheet from "./ChatJobUpdateSheet.jsx";
import ChatPaymentConfirmSheet from "./ChatPaymentConfirmSheet.jsx";
import { LE_PRO_CONVO, clearLegacyDeviceConvo, legacyDeviceConvo } from "../lib/chatConvo.js";
import { appendPayment } from "../lib/payments.js";
import { paymentAutofillPatch } from "../lib/paymentAutofill.js";
import {
  analyzeImageIntent,
  analyzePaymentScreenshot,
  detectPaymentKind,
  fileToBase64,
} from "../lib/paymentVision.js";
import { formatImageIntentSummary, suggestActionsFromImage } from "../lib/imageIntent.js";
const ONLINE_MS = 4 * 60_000; // israel-heartbeat (or last reply) younger than this = online
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

/** Browser notification for an Israel reply that arrived while tab hidden. */
function notifyReply(m) {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const n = new Notification("Israel replied", {
      body: String((m && m.text) || "New message").slice(0, 160),
      tag: "le-pro-israel", // collapse repeats into one
    });
    n.onclick = () => {
      try {
        window.focus();
        n.close();
      } catch {}
    };
  } catch {}
}

/** Bubble messages are who:"you"; Israel replies who:"israel" (legacy: claude/dispatch). */
const isAgentMsg = (m) =>
  m.who === "israel" || m.who === "dispatch" || m.who === "claude";


/** Unread badge for chat triggers in the nav bar or desktop FAB. */
export function ChatUnreadBadge({ unread }) {
  if (!unread) return null;
  return (
    <span
      className="absolute -top-0.5 -right-0.5 flex items-center justify-center"
      data-testid="chat-unread-dot"
      aria-label={`${unread} new ${unread === 1 ? "reply" : "replies"} from Israel`}
    >
      <span className="absolute inline-flex w-full h-full rounded-full bg-red-500 opacity-75 animate-ping" />
      <span className="relative inline-flex min-w-[16px] h-[16px] px-1 rounded-full bg-red-600 text-white text-[10px] font-extrabold leading-[16px] items-center justify-center">
        {unread > 9 ? "9+" : unread}
      </span>
    </span>
  );
}

export default function ChatBubble() {
  const {
    api,
    effectiveJob,
    showToast,
    jobs,
    patchJob,
    patchAndSave,
    addDevTask,
    setNewJob,
    chatOpen,
    setChatOpen,
    chatUnread,
    setChatUnread,
  } = useStore();
  const loc = useLocation();
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const [ctxOn, setCtxOn] = useState(true);
  const [rec, setRec] = useState(false);
  const [dispatchSeen, setDispatchSeen] = useState(0); // responder heartbeat ts
  const [jobSheet, setJobSheet] = useState(false);
  const [paymentDraft, setPaymentDraft] = useState(null);
  const [imageActionDraft, setImageActionDraft] = useState(null);
  const [imageBusy, setImageBusy] = useState(false);
  const imageInputRef = useRef(null);
  const convo = useRef(LE_PRO_CONVO);
  const migrated = useRef(false);
  const lastN = useRef(0);
  const lastDispatchN = useRef(null); // null = not baselined yet (first poll)
  const openRef = useRef(chatOpen);
  openRef.current = chatOpen;
  const logRef = useRef(null);
  const inputRef = useRef(null);
  const stickRef = useRef(true);
  const scrollMemRef = useRef({ top: 0, max: 0, pinned: false });
  const msgsSigRef = useRef(""); // skip scroll work when poll returns the same thread
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
      const dispatch = ms.filter(isAgentMsg);
      // NB: capture the delta NOW — the setUnread updater runs after the ref
      // is overwritten below (the old code read the ref inside the updater,
      // which made the delta 0 and the badge never increment).
      const fresh = lastDispatchN.current === null ? 0 : dispatch.length - lastDispatchN.current;
      if (fresh > 0) {
        if (!openRef.current) setChatUnread((u) => u + fresh);
        if (typeof document !== "undefined" && document.visibilityState === "hidden")
          notifyReply(dispatch[dispatch.length - 1]);
      }
      lastDispatchN.current = dispatch.length;
      lastN.current = ms.length;
      setMsgs(ms.concat(localMsgs.current));
    } catch {}
  }, [api]);

  // One-time merge of a legacy per-device thread into the shared server-side convo.
  useEffect(() => {
    if (migrated.current) return;
    const old = legacyDeviceConvo();
    if (!old) return;
    migrated.current = true;
    (async () => {
      try {
        if (api.chatMigrate) await api.chatMigrate(old, LE_PRO_CONVO);
        clearLegacyDeviceConvo();
        poll();
      } catch {}
    })();
  }, [api, poll]);

  // 3s while the panel is open (live conversation), 5s in the background.
  useEffect(() => {
    poll();
    const t = setInterval(poll, chatOpen ? 3000 : 5000);
    return () => clearInterval(t);
  }, [poll, chatOpen]);

  // Responder presence — is Israel's chat_responder alive?
  const pollPresence = useCallback(async () => {
    try {
      const map = (api.presenceMap && (await api.presenceMap())) || {};
      const d = map["israel-heartbeat"] || map["dispatch-heartbeat"];
      setDispatchSeen((d && d.lastSeen) || 0);
    } catch {}
  }, [api]);

  useEffect(() => {
    if (!chatOpen) return;
    pollPresence();
    const t = setInterval(pollPresence, 15000);
    return () => clearInterval(t);
  }, [chatOpen, pollPresence]);

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
    if (chatOpen) presencePing(); // panel open
    const t = setInterval(presencePing, chatOpen ? 20000 : 45000);
    return () => clearInterval(t);
  }, [chatOpen, presencePing]);

  const isNearBottom = useCallback((el) => {
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX;
  }, []);

  const rememberScroll = useCallback((el) => {
    if (!el) return;
    const max = Math.max(0, el.scrollHeight - el.clientHeight);
    const pinned = max - el.scrollTop > NEAR_BOTTOM_PX;
    scrollMemRef.current = { top: el.scrollTop, max, pinned };
    stickRef.current = !pinned;
  }, []);

  const onLogScroll = useCallback(() => {
    rememberScroll(logRef.current);
  }, [rememberScroll]);

  const msgsSignature = useCallback((list, workingOn) => {
    const tail = list[list.length - 1];
    const w = workingOn ? workingOn.id + ":" + (workingOn.status || "") : "";
    return `${list.length}|${tail?.id || ""}|${tail?.text?.length || 0}|${tail?.status || ""}|${w}`;
  }, []);

  // When the thread changes: scroll to bottom unless the user explicitly scrolled
  // up (pinned). On open pinned is false so we always land on the newest message;
  // poll() every 3s won't yank readers who scrolled up to read history.
  useLayoutEffect(() => {
    if (!chatOpen) return;
    const sig = msgsSignature(msgs, msgs.find((m) => m.status === "Working on it"));
    if (sig === msgsSigRef.current) return;

    const node = logRef.current;
    if (!node) return;

    msgsSigRef.current = sig;

    if (scrollMemRef.current.pinned) {
      node.scrollTop = scrollMemRef.current.top;
      rememberScroll(node);
      return;
    }
    node.scrollTop = node.scrollHeight;
    rememberScroll(node);
  }, [msgs, chatOpen, msgsSignature, rememberScroll]);

  const resizeInput = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "0px";
    const max = Math.min(160, Math.floor(window.innerHeight * 0.28));
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
  }, []);

  useEffect(() => {
    resizeInput();
  }, [text, chatOpen, resizeInput]);

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

  const attachContact = useCallback(async () => {
    try {
      if (navigator.contacts && navigator.ContactsManager) {
        const props = ["name", "tel", "email"];
        const picked = await navigator.contacts.select(props, { multiple: false });
        const c = picked?.[0];
        if (!c) return;
        const name = (c.name || []).map((n) => n.givenName || n.familyName).filter(Boolean).join(" ");
        const phone = (c.tel || [])[0] || "";
        const email = (c.email || [])[0] || "";
        const line = [name, phone, email].filter(Boolean).join(" · ");
        if (line) setText((t) => (t ? t + " " : "") + line);
        return;
      }
    } catch {}
    showToast("Type a name and number — contact picker needs Chrome on Android");
  }, [showToast]);

  const onChatImage = useCallback(
    async (e) => {
      const file = e.target.files?.[0];
      if (imageInputRef.current) imageInputRef.current.value = "";
      if (!file) return;
      setImageBusy(true);
      try {
        const b64 = await fileToBase64(file);
        const previewUrl = URL.createObjectURL(file);
        let extracted = null;
        let kind = null;
        for (const k of ["zelle", "check"]) {
          try {
            extracted = await analyzePaymentScreenshot(b64, file.type || "image/jpeg", k);
            kind = detectPaymentKind(extracted, file.name) || k;
            if (extracted?.amount > 0 || extracted?.confirmationNumber || extracted?.checkNumber) break;
          } catch {
            extracted = null;
          }
        }
        const patch = paymentAutofillPatch(extracted || {});
        const payKind = kind === "check" ? "Check" : "Zelle";
        if (extracted?.amount > 0 || patch.ref) {
          setPaymentDraft({
            kind: payKind,
            amount: patch.amt || "",
            ref: patch.ref || "",
            memo: patch.memo || "",
            date: patch.dt || "",
            extracted,
            proofName: file.name,
            previewUrl,
            file,
          });
          return;
        }
        let intent = null;
        try {
          intent = await analyzeImageIntent(b64, file.type || "image/jpeg");
        } catch {
          intent = null;
        }
        const actions = suggestActionsFromImage({
          extracted: intent || {},
          jobs,
          activeJob,
        });
        const summary = formatImageIntentSummary(intent || {}, actions);
        setImageActionDraft({
          previewUrl,
          file,
          extracted: intent,
          actions,
          summary,
          proofName: file.name,
        });
        showToast("Pick what you want to do with this photo");
      } catch {
        showToast("Could not read that image");
      } finally {
        setImageBusy(false);
      }
    },
    [activeJob, chatCtx, jobs, showToast]
  );

  const confirmImageAction = useCallback(
    async (action) => {
      const draft = imageActionDraft;
      setImageActionDraft(null);
      if (!draft) return;
      if (action.kind === "record_payment" && action.job) {
        const patch = paymentAutofillPatch(draft.extracted || {});
        setPaymentDraft({
          kind: draft.extracted?.paymentMethod === "check" ? "Check" : "Zelle",
          amount: action.amount || patch.amt || "",
          ref: patch.ref || "",
          memo: patch.memo || "",
          date: patch.dt || "",
          extracted: draft.extracted,
          proofName: draft.proofName,
          previewUrl: draft.previewUrl,
          file: draft.file,
        });
        return;
      }
      const line =
        action.kind === "open_job"
          ? "Open job " + (action.job?.customer || "") + " #" + (action.invoiceNo || action.job?.invoiceNo || "")
          : "Help me with this image: " + (draft.summary || draft.proofName);
      const msg = {
        id: "m-img-" + Date.now(),
        who: "you",
        text: line,
        status: "Sent",
        _local: true,
        imageUrl: draft.previewUrl,
      };
      localMsgs.current = [...localMsgs.current, msg];
      setMsgs((ms) => [...ms, msg]);
      const full = chatCtx() + line + (draft.summary ? " — " + draft.summary : "");
      try {
        await api.chatSend(convo.current, msg.id, full);
      } catch {}
      api
        .iterate(full, "pro-bubble:" + convo.current, {
          view,
          jobId: action.job?.id || jobId || "",
          pathname: loc.pathname,
          hasImage: true,
          imageIntent: draft.summary,
        })
        .catch(() => {});
      if (action.kind === "open_job" && action.job?.id) {
        window.location.hash = "#/job/" + action.job.id;
        showToast("Opened " + (action.job.customer || "job"));
      }
    },
    [api, chatCtx, imageActionDraft, jobId, loc.pathname, showToast, view]
  );

  const confirmChatPayment = useCallback(
    async (confirmed) => {
      setPaymentDraft(null);
      if (!activeJob?.id) {
        showToast("Open the invoice job first to stage a payment");
        return;
      }
      const noteBits = [];
      if (confirmed.kind === "Check" && confirmed.ref) noteBits.push("Check #" + confirmed.ref);
      else if (confirmed.ref) noteBits.push("Zelle ref " + confirmed.ref);
      if (confirmed.memo) noteBits.push(confirmed.memo);
      if (confirmed.proofName) noteBits.push("proof: " + confirmed.proofName);
      const patch = appendPayment(activeJob, {
        amount: confirmed.amount,
        method: confirmed.kind,
        ref: confirmed.ref,
        date: confirmed.date,
        note: noteBits.length ? noteBits.join(" · ") : undefined,
        zelleVerified: confirmed.kind === "Zelle",
        paymentAutofilled: true,
        zelleProofName: confirmed.kind === "Zelle" ? confirmed.proofName : undefined,
        paymentProofName: confirmed.proofName,
      });
      patchJob(activeJob.id, patch);
      showToast("Payment staged — tap Save & sync on the job");
      const summary =
        confirmed.kind +
        " $" +
        confirmed.amount +
        (confirmed.ref ? " #" + confirmed.ref : "") +
        (confirmed.memo ? " — " + confirmed.memo : "");
      const full = chatCtx() + "Payment from image: " + summary;
      const msg = { id: "m-pay-" + Date.now(), who: "you", text: full, status: "Sent", _local: true };
      localMsgs.current = [...localMsgs.current, msg];
      setMsgs((ms) => [...ms, msg]);
      try {
        await api.chatSend(convo.current, msg.id, full);
      } catch {}
      api.iterate(full, "pro-bubble:" + convo.current, { view, jobId: jobId || "", pathname: loc.pathname, paymentImage: true }).catch(() => {});
    },
    [activeJob, api, chatCtx, jobId, loc.pathname, patchJob, showToast, view]
  );

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

  useEffect(() => {
    if (!chatOpen) return;
    setChatUnread(0);
    setCtxOn(true);
    askNotifyPermission();
    poll();
  }, [chatOpen, poll]);

  // Scroll to latest once when the panel opens; do not reset stick on every poll.
  useEffect(() => {
    if (!chatOpen) return;
    stickRef.current = true;
    scrollMemRef.current = { top: 0, max: 0, pinned: false };
    msgsSigRef.current = ""; // next layout pass scrolls to bottom once
  }, [chatOpen]);

  const tryInvoiceEditFromBubble = useCallback(
    async (t) => {
      if (!jobId || !activeJob) return false;
      const intent = parseInvoiceEditIntent(t);
      if (!intent) return false;
      const patch = buildAgentDraftPatch(activeJob, intent, t);
      if (!patch) return false;
      await patchAndSave(jobId, patch);
      showToast("Invoice draft saved — tap Invoice to review");
      const note = {
        id: "m-inv-" + Date.now(),
        who: "israel",
        text:
          "Applied invoice edits: " +
          (intent.summary || t) +
          ". Invoice tab is pulsing — open it to review and approve before QuickBooks sync.",
        status: "",
        ts: Date.now(),
        _local: true,
      };
      localMsgs.current = [...localMsgs.current, note];
      setMsgs((ms) => [...ms, note]);
      return true;
    },
    [jobId, activeJob, patchAndSave, showToast]
  );

  const send = async () => {
    const t = text.trim();
    if (!t) return;
    const slash = parseChatSlash(t);
    if (slash) {
      setText("");
      const handled = await runSlash(slash);
      if (handled) return;
    }
    if (await tryInvoiceEditFromBubble(t)) {
      setText("");
      requestAnimationFrame(resizeInput);
      const full = chatCtx() + t;
      const msg = { id: "m" + Date.now(), who: "you", text: full, status: "Sent", _local: true };
      localMsgs.current = [...localMsgs.current, msg];
      setMsgs((ms) => [...ms, msg]);
      try {
        await api.chatSend(convo.current, msg.id, full);
      } catch {}
      return;
    }
    setText("");
    requestAnimationFrame(resizeInput);
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

  // Liveness — a recent Israel REPLY is proof the responder is alive even when
  // its presence heartbeat lags (israel-heartbeat pings every ~2s when active, so
  // relying on it alone left the header stuck on "away" while replies flowed in
  // seconds). Online = fresh heartbeat OR a reply within the same window.
  const lastReplyTs = msgs.reduce((mx, m) => (isAgentMsg(m) && m.ts > mx ? m.ts : mx), 0);
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

  if (!chatOpen) return null;

  return (
    <>
        <div
          className="fixed z-50 inset-x-2.5 bottom-[4.75rem] lg:inset-x-auto lg:right-6 lg:bottom-20 lg:w-[400px] max-w-[420px] ml-auto bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[64vh] overflow-hidden"
          data-testid="chat-panel"
        >
          <div className="flex items-center gap-2 px-4 py-2.5 bg-brand text-white">
            <div className="flex-1 min-w-0">
              <b className="block text-sm leading-tight">Israel</b>
              <span className="flex items-center gap-1.5 text-[11px] opacity-90 leading-tight" data-testid="presence-line">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${online ? "bg-emerald-300" : "bg-white/40"}`} />
                {online ? "online" : "away — may take a few minutes for big tasks"}
              </span>
            </div>
            {working && <span className="text-[11px] opacity-85 shrink-0">working…</span>}
            <button onClick={() => setChatOpen(false)} className="text-white" aria-label="Close chat">✕</button>
          </div>
          <div
            ref={logRef}
            data-testid="chat-log"
            onScroll={onLogScroll}
            className="flex-1 overflow-y-auto lg-scroll-hidden p-3 min-h-[120px]"
          >
            {msgs.length ? (
              msgs.map((m, i) => (
                <div
                  key={m.id || i}
                  className={`max-w-[82%] rounded-2xl px-3 py-2 text-sm mb-2 ${
                    isAgentMsg(m)
                      ? "bg-slate-100 rounded-bl-md"
                      : "bg-brand text-white ml-auto rounded-br-md"
                  }`}
                >
                  {m.imageUrl ? (
                    <img src={m.imageUrl} alt="" className="rounded-lg max-h-28 mb-1 object-contain bg-white/10" />
                  ) : null}
                  {m.text}
                  <span className="block text-[10px] opacity-70 mt-0.5 text-right" data-testid="msg-meta">
                    {isAgentMsg(m) ? "Israel" : statusLabel(m.status)}
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
                  ? "Israel is still on it — this one's taking a little longer."
                  : "Israel is working on it…"}
              </div>
            )}
          </div>
          {!msgs.some(isAgentMsg) && (
            <div className="px-3 pb-1 text-[11px] text-slate-400 text-center" data-testid="chat-hint">
              Israel shares the same brain as @LE_Israel_bot — smart tasks welcome
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
            <button
              type="button"
              className="shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700"
              onClick={attachContact}
              data-testid="chat-action-contact"
            >
              Contact
            </button>
          </div>
          <div className="px-3 pb-1 text-[10px] text-slate-400" data-testid="chat-slash-hint">
            {CHAT_SLASH_HINT}
          </div>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onChatImage}
            data-testid="chat-image-input"
          />
          <div className="flex items-end gap-2 p-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              disabled={imageBusy}
              aria-label="Attach image"
              className="w-9 h-9 rounded-full bg-slate-100 shrink-0 text-base"
              data-testid="chat-attach-image"
            >
              {imageBusy ? (
                <span className="inline-block w-4 h-4 border-2 border-slate-300 border-t-brand rounded-full animate-spin" />
              ) : (
                "📷"
              )}
            </button>
            <textarea
              ref={inputRef}
              className="input flex-1 min-h-[2.5rem] resize-none overflow-y-auto lg-scroll-hidden leading-snug py-2"
              rows={1}
              placeholder="Message Israel…"
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
      {jobSheet && activeJob && <ChatJobUpdateSheet job={activeJob} onClose={() => setJobSheet(false)} />}
      {imageActionDraft ? (
        <ChatImageActionSheet
          draft={imageActionDraft}
          onPick={confirmImageAction}
          onCancel={() => {
            if (imageActionDraft?.previewUrl) URL.revokeObjectURL(imageActionDraft.previewUrl);
            setImageActionDraft(null);
          }}
        />
      ) : null}
      {paymentDraft ? (
        <ChatPaymentConfirmSheet
          draft={paymentDraft}
          job={activeJob}
          onConfirm={confirmChatPayment}
          onCancel={() => {
            if (paymentDraft?.previewUrl) URL.revokeObjectURL(paymentDraft.previewUrl);
            setPaymentDraft(null);
          }}
        />
      ) : null}
    </>
  );
}
