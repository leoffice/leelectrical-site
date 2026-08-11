// Floating Israel chat — bubble on every view, gradient panel, removable
// context chip, Web Speech mic with level animation, message statuses,
// unread badge. Posts to the chat fn (op:msg) + iterate fn; polls 5s closed,
// 3s while the panel is open. Sends presence heartbeats (op:presence) and
// reads the presence map back to show "Israel • online" (chat_responder pings
// convo "israel-heartbeat"). Israel replies fire a browser Notification when
// the tab is hidden (permission asked on first open).
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useStoreData } from "../state/store.jsx";
import { fmt$ } from "../lib/format.js";
import { appointmentContextFromRoute } from "../lib/appointmentContext.js";
import { CHAT_SLASH_HINT, jobPatchFromSlash, parseChatSlash } from "../lib/chatActions.js";
import { buildAgentDraftPatch } from "../lib/invoiceAgentDraft.js";
import { parseInvoiceEditIntent } from "../lib/invoiceEditIntent.js";
import ChatImageActionSheet from "./ChatImageActionSheet.jsx";
import ChatJobUpdateSheet from "./ChatJobUpdateSheet.jsx";
import ChatPaymentConfirmSheet from "./ChatPaymentConfirmSheet.jsx";
import ChatReplyButtons from "./ChatReplyButtons.jsx";
import { parseReplyButtons } from "../lib/chatReplyButtons.js";
import { LE_PRO_CONVO, clearLegacyDeviceConvo, legacyDeviceConvo } from "../lib/chatConvo.js";
import { appendPayment } from "../lib/payments.js";
import { productName } from "../lib/tenantBranding.js";
import { useTenantConfig } from "../state/tenant.jsx";

import {
  analyzeImageIntent,
  analyzePaymentImage,
  fileToBase64,
} from "../lib/paymentVision.js";
import { formatImageIntentSummary, suggestActionsFromImage } from "../lib/imageIntent.js";
import {
  buildChatPaymentDraft,
  isPaymentMethodOnly,
  looksLikePaymentImage,
  parsePaymentMethodHint,
  shouldAutoOpenPaymentDraft,
} from "../lib/chatPayment.js";
import { findJobByInvoice } from "../lib/zelleReconcile.js";
import {
  buildChatFileLine,
  isImageFile,
  isTextFile,
  readTextExcerpt,
  uploadChatAttachment,
} from "../lib/chatAttach.js";
import {
  setChatPanelSize,
  setSpeechToTextEnabled,
  useAppSettings,
} from "../lib/appSettings.js";
import { speakAssistantText, stopAssistantSpeech } from "../lib/assistantSpeak.js";
import {
  buildAdminWelcomeMessage,
  ensureFirstOpenStamp,
  markAdminWelcomeSent,
  shouldDeliverAdminWelcome,
} from "../lib/adminWelcome.js";
const ONLINE_MS = 4 * 60_000; // israel-heartbeat (or last reply) younger than this = online
const STUCK_MS = 90_000; // a "Working on it" we've watched longer than this stops looking like a live spinner
const NEAR_BOTTOM_PX = 48; // within this distance of the bottom we auto-scroll on new messages
/** Quick emoji strip for the + menu (no heavy picker dependency). */
const CHAT_EMOJIS = [
  "👍",
  "✅",
  "🙏",
  "😂",
  "😊",
  "🔥",
  "💪",
  "📅",
  "💰",
  "📍",
  "⚡",
  "🛠️",
  "📎",
  "❗",
  "❓",
  "👋",
];

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

/** Bubble messages are who:"you"; Israel replies who:"israel" (legacy: claude/dispatch).
 *  who:"admin" = delayed welcome from Levi (developer). */
const isAgentMsg = (m) =>
  m.who === "israel" || m.who === "dispatch" || m.who === "claude" || m.who === "admin";

function agentLabel(m) {
  if (m && m.who === "admin") return "Levi · Developer";
  return "Israel";
}


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
  } = useStoreData();
  const { speechToText, chatPanelSize, assistantSpeak, assistantVoice } = useAppSettings();
  const product = productName(useTenantConfig());
  const loc = useLocation();
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const [ctxOn, setCtxOn] = useState(true);
  const [rec, setRec] = useState(false);
  const [dispatchSeen, setDispatchSeen] = useState(0); // responder heartbeat ts
  const [jobSheet, setJobSheet] = useState(false);
  const [paymentDraft, setPaymentDraft] = useState(null);
  const [pendingPaymentImage, setPendingPaymentImage] = useState(null);
  const [imageActionDraft, setImageActionDraft] = useState(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const imageInputRef = useRef(null);
  const convo = useRef(LE_PRO_CONVO);
  const lastSpokenId = useRef(null);
  // Mirror of the controlled draft so send can clear the box in the same tick
  // without waiting for React to flush — same feel as a normal chat app.
  const textRef = useRef("");
  const setComposerText = useCallback((next) => {
    const v = typeof next === "function" ? next(textRef.current) : next;
    textRef.current = String(v ?? "");
    setText(textRef.current);
  }, []);
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
    return `[${product} / ${view} view] — `;
  }, [ctxOn, jobId, view, effectiveJob, product]);

  // Optimistically-rendered messages the server hasn't echoed back yet —
  // poll() keeps them visible instead of blinking them away.
  const localMsgs = useRef([]);
  // Device-local admin welcome (not shared server convo — multi-device safe).
  const adminWelcomeRef = useRef(null);

  // Stamp first open so the ~20 min welcome clock starts.
  useEffect(() => {
    ensureFirstOpenStamp();
  }, []);

  const poll = useCallback(async () => {
    try {
      const ms = await api.chatList(convo.current);
      localMsgs.current = localMsgs.current.filter((lm) => !ms.some((m) => m.id === lm.id));

      // ~20 min after first open: one-time welcome from Levi (admin/developer).
      if (!adminWelcomeRef.current && shouldDeliverAdminWelcome()) {
        adminWelcomeRef.current = buildAdminWelcomeMessage();
        markAdminWelcomeSent();
      }
      const welcomeExtra =
        adminWelcomeRef.current && !ms.some((m) => m.id === adminWelcomeRef.current.id)
          ? [adminWelcomeRef.current]
          : [];

      // Unread + notifications track DISPATCH replies only (own sends don't
      // count), and the very first poll just baselines old history.
      // Admin welcome is included so new users see the badge once.
      const dispatch = ms.filter(isAgentMsg).concat(welcomeExtra.filter(isAgentMsg));
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
      lastN.current = ms.length + welcomeExtra.length;
      setMsgs(ms.concat(welcomeExtra).concat(localMsgs.current));
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

  // Only resize when the box actually needs a new height (new line wrap), not every character.
  const lastComposerH = useRef(0);
  const resizeInput = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const prev = el.style.height;
    el.style.height = "0px";
    const max = Math.min(160, Math.floor(window.innerHeight * 0.28));
    const next = Math.min(el.scrollHeight, max);
    if (next === lastComposerH.current && prev) {
      el.style.height = prev;
      return;
    }
    lastComposerH.current = next;
    el.style.height = `${next}px`;
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
        setComposerText("/task ");
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
      if (ok !== false) setComposerText("");
      return true;
    },
    [addDevTask, setComposerText, showToast]
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
        if (line) setComposerText((t) => (t ? t + " " : "") + line);
        return;
      }
    } catch {}
    showToast("Type a name and number — contact picker needs Chrome on Android");
  }, [setComposerText, showToast]);

  const sendChatFile = useCallback(
    async (file) => {
      setImageBusy(true);
      try {
        const excerpt = await readTextExcerpt(file);
        let fileUrl = "";
        if (!excerpt || !isTextFile(file)) {
          fileUrl = await uploadChatAttachment(file);
        }
        const line = buildChatFileLine(file, { fileUrl, excerpt });
        const full = chatCtx() + line;
        const msg = {
          id: "m-file-" + Date.now(),
          who: "you",
          text: full,
          status: "Sent",
          _local: true,
          fileName: file.name,
          fileUrl: fileUrl || undefined,
        };
        localMsgs.current = [...localMsgs.current, msg];
        setMsgs((ms) => [...ms, msg]);
        await api.chatSend(convo.current, msg.id, full);
        api
          .iterate(full, "pro-bubble:" + convo.current, {
            view,
            jobId: jobId || "",
            pathname: loc.pathname,
            hasFile: true,
            fileName: file.name,
            fileType: file.type || "",
            fileUrl,
          })
          .catch(() => {});
        showToast("File attached — sent to Israel");
        poll();
      } catch {
        showToast("Could not attach that file");
      } finally {
        setImageBusy(false);
      }
    },
    [api, chatCtx, jobId, loc.pathname, poll, showToast, view]
  );

  const onChatAttach = useCallback(
    async (e) => {
      const file = e.target.files?.[0];
      if (imageInputRef.current) imageInputRef.current.value = "";
      if (!file) return;
      if (!isImageFile(file)) {
        await sendChatFile(file);
        return;
      }
      setImageBusy(true);
      try {
        const b64 = await fileToBase64(file);
        const previewUrl = URL.createObjectURL(file);
        const { extracted, kind } = await analyzePaymentImage(
          b64,
          file.type || "image/jpeg",
          text,
          file.name
        );
        const methodHint = parsePaymentMethodHint(text);
        if (looksLikePaymentImage(extracted)) {
          if (methodHint || activeJob?.invoiceNo) {
            setPendingPaymentImage(null);
            setPaymentDraft(
              buildChatPaymentDraft({
                extracted,
                visionKind: kind,
                file,
                previewUrl,
                textHint: text,
                jobInvoiceNo: activeJob?.invoiceNo || "",
              })
            );
            setComposerText("");
            return;
          }
          setPendingPaymentImage({ extracted, visionKind: kind, file, previewUrl, proofName: file.name });
          showToast("Got the photo — type check or zelle when you're ready");
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
    [activeJob, jobs, sendChatFile, setComposerText, showToast, text]
  );

  const confirmImageAction = useCallback(
    async (action) => {
      const draft = imageActionDraft;
      setImageActionDraft(null);
      if (!draft) return;
      if (action.kind === "record_payment" && action.job) {
        setPaymentDraft(
          buildChatPaymentDraft({
            extracted: draft.extracted,
            visionKind: draft.extracted?.paymentMethod === "check" ? "check" : "zelle",
            file: draft.file,
            previewUrl: draft.previewUrl,
            textHint: text,
            jobInvoiceNo: action.job?.invoiceNo || action.invoiceNo || "",
          })
        );
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

  const openPaymentDraft = useCallback(
    (pending, hintText) => {
      setPendingPaymentImage(null);
      setPaymentDraft(
        buildChatPaymentDraft({
          extracted: pending.extracted,
          visionKind: pending.visionKind,
          file: pending.file,
          previewUrl: pending.previewUrl,
          textHint: hintText,
          jobInvoiceNo: activeJob?.invoiceNo || "",
        })
      );
    },
    [activeJob]
  );

  const confirmChatPayment = useCallback(
    async (confirmed) => {
      setPaymentDraft(null);
      const target =
        activeJob?.id && (!confirmed.invoiceNo || String(activeJob.invoiceNo) === String(confirmed.invoiceNo))
          ? activeJob
          : findJobByInvoice(jobs, confirmed.invoiceNo) || activeJob;
      if (!target?.id) {
        showToast(
          confirmed.invoiceNo
            ? "No job found for invoice #" + confirmed.invoiceNo + " — open that job first"
            : "Open the invoice job first to stage a payment"
        );
        return;
      }
      const noteBits = [];
      if (confirmed.kind === "Check" && confirmed.ref) noteBits.push("Check #" + confirmed.ref);
      else if (confirmed.ref) noteBits.push("Zelle ref " + confirmed.ref);
      if (confirmed.deposit) noteBits.push("Deposit: " + confirmed.deposit);
      if (confirmed.memo) noteBits.push(confirmed.memo);
      if (confirmed.proofName) noteBits.push("proof: " + confirmed.proofName);
      const patch = appendPayment(target, {
        amount: confirmed.amount,
        method: confirmed.kind,
        ref: confirmed.ref,
        date: confirmed.date,
        note: noteBits.length ? noteBits.join(" · ") : undefined,
        zelleVerified: confirmed.kind === "Zelle",
        paymentAutofilled: true,
        zelleProofName: confirmed.kind === "Zelle" ? confirmed.proofName : undefined,
        paymentProofName: confirmed.proofName,
        depositTo: confirmed.deposit || undefined,
      });
      patchJob(target.id, patch);
      showToast("Payment staged — tap Save & sync on the job");
      const summary =
        confirmed.kind +
        " $" +
        confirmed.amount +
        (confirmed.ref ? " #" + confirmed.ref : "") +
        (confirmed.invoiceNo ? " inv #" + confirmed.invoiceNo : "") +
        (confirmed.memo ? " — " + confirmed.memo : "");
      const full = chatCtx() + "Payment from image: " + summary;
      const msg = { id: "m-pay-" + Date.now(), who: "you", text: full, status: "Sent", _local: true };
      localMsgs.current = [...localMsgs.current, msg];
      setMsgs((ms) => [...ms, msg]);
      try {
        await api.chatSend(convo.current, msg.id, full);
      } catch {}
      api
        .iterate(full, "pro-bubble:" + convo.current, {
          view,
          jobId: target.id || jobId || "",
          pathname: loc.pathname,
          paymentImage: true,
        })
        .catch(() => {});
      if (target.id !== jobId) {
        window.location.hash = "#/job/" + target.id;
      }
    },
    [activeJob, api, chatCtx, jobId, jobs, loc.pathname, patchJob, showToast, view]
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

  // Speak new Israel replies when Settings → Speak replies is on.
  useEffect(() => {
    if (!assistantSpeak) return;
    const agents = msgs.filter(isAgentMsg);
    if (!agents.length) return;
    const latest = agents[agents.length - 1];
    if (!latest?.id || latest.id === lastSpokenId.current) return;
    // First paint of history: baseline without speaking old threads.
    if (lastSpokenId.current === null) {
      lastSpokenId.current = latest.id;
      return;
    }
    lastSpokenId.current = latest.id;
    speakAssistantText(latest.text, { voiceId: assistantVoice });
  }, [msgs, assistantSpeak, assistantVoice]);

  useEffect(() => {
    if (!chatOpen) stopAssistantSpeech();
  }, [chatOpen]);

  // Pending payment photo + typed context opens the confirm sheet without tapping send.
  useEffect(() => {
    if (!pendingPaymentImage || !shouldAutoOpenPaymentDraft(text)) return;
    const pending = pendingPaymentImage;
    const hint = text;
    const timer = setTimeout(() => {
      openPaymentDraft(pending, hint);
      setComposerText("");
    }, 500);
    return () => clearTimeout(timer);
  }, [text, pendingPaymentImage, openPaymentDraft, setComposerText]);

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
          "Proposed invoice edits (pending approval): " +
          (intent.summary || t) +
          ". Live total unchanged until you approve. Invoice tab is pulsing — or use the approval card.",
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

  const postChatText = useCallback(
    async (t, { skipSlash = false, skipInvoiceEdit = false } = {}) => {
      const trimmed = String(t || "").trim();
      if (!trimmed) return;
      if (pendingPaymentImage && (isPaymentMethodOnly(trimmed) || parsePaymentMethodHint(trimmed))) {
        openPaymentDraft(pendingPaymentImage, trimmed);
        return;
      }
      if (!skipSlash) {
        const slash = parseChatSlash(trimmed);
        if (slash) {
          const handled = await runSlash(slash);
          if (handled) return;
        }
      }
      if (!skipInvoiceEdit && (await tryInvoiceEditFromBubble(trimmed))) {
        const full = chatCtx() + trimmed;
        const msg = { id: "m" + Date.now(), who: "you", text: full, status: "Sent", _local: true };
        localMsgs.current = [...localMsgs.current, msg];
        setMsgs((ms) => [...ms, msg]);
        try {
          await api.chatSend(convo.current, msg.id, full);
        } catch {}
        return;
      }
      stickRef.current = true;
      const full = chatCtx() + trimmed;
      setCtxOn(true);
      const msg = { id: "m" + Date.now(), who: "you", text: full, status: "Sent", _local: true };
      localMsgs.current = [...localMsgs.current, msg];
      setMsgs((ms) => [...ms, msg]);
      let ok = false;
      try {
        await api.chatSend(convo.current, msg.id, full);
        ok = true;
      } catch {
        try {
          await api.chatSend(convo.current, msg.id, full);
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
      api
        .iterate(full, "pro-bubble:" + convo.current, {
          view,
          jobId: jobId || "",
          pathname: loc.pathname,
        })
        .catch(() => {});
      poll();
    },
    [api, chatCtx, jobId, loc.pathname, openPaymentDraft, pendingPaymentImage, poll, runSlash, showToast, tryInvoiceEditFromBubble, view]
  );

  const pickReplyButton = useCallback(
    (button) => {
      // Fire-and-forget — never hold the UI for a reply-button send.
      void postChatText(button.replyText || button.label || "A", { skipSlash: true, skipInvoiceEdit: true });
    },
    [postChatText]
  );

  /** Clear the composer immediately (state + native value) so the box empties
   *  the instant Send is tapped — not when Israel finishes answering. */
  const clearComposer = useCallback(() => {
    textRef.current = "";
    setText("");
    if (inputRef.current) {
      inputRef.current.value = "";
      inputRef.current.style.height = "";
    }
    requestAnimationFrame(resizeInput);
  }, [resizeInput]);

  const insertEmoji = useCallback(
    (emoji) => {
      setComposerText((t) => t + emoji);
      setEmojiOpen(false);
      setPlusOpen(false);
      try {
        inputRef.current?.focus({ preventScroll: true });
      } catch {
        try {
          inputRef.current?.focus();
        } catch {}
      }
    },
    [setComposerText]
  );

  const send = () => {
    const t = (textRef.current || text).trim();
    if (!t) return;
    // Close attach menus so they don't sit over a fresh draft.
    setPlusOpen(false);
    setEmojiOpen(false);
    // Clear first — same path as a regular message, never wait on the network
    // or on Israel's reply before the box is empty and ready for the next line.
    clearComposer();
    // Keep focus so Levi can type the next message while Israel is still working.
    try {
      inputRef.current?.focus({ preventScroll: true });
    } catch {
      try {
        inputRef.current?.focus();
      } catch {}
    }
    const slash = parseChatSlash(t);
    if (slash) {
      // Slash commands still run async; UI is already free.
      void (async () => {
        const handled = await runSlash(slash);
        if (!handled) void postChatText(t);
      })();
      return;
    }
    // Network + AI iterate are background — do not await.
    void postChatText(t);
  };

  /* mic with level animation (Web Speech API + analyser) */
  const toggleMic = () => {
    if (recRef.current) {
      recRef.current.stop();
      return;
    }
    if (!speechToText) {
      showToast("Speech to text is off — turn it on in Company settings");
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
    const base = textRef.current || text;
    r.onresult = (e) => {
      let s = "";
      for (const res of e.results) s += res[0].transcript;
      setComposerText((base ? base + " " : "") + s);
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

  const expanded = chatPanelSize === "expanded";
  const panelSizeClass = expanded
    ? "chat-panel chat-panel-expanded fixed z-50 inset-2 bottom-[4.5rem] lg:inset-4 lg:bottom-6 lg:left-auto lg:right-4 lg:w-[min(720px,calc(100vw-2rem))] max-w-none ml-auto rounded-2xl shadow-2xl border flex flex-col max-h-[calc(100vh-5.5rem)] lg:max-h-[calc(100vh-3rem)] overflow-hidden"
    : "chat-panel fixed z-50 inset-x-2.5 bottom-[4.75rem] lg:inset-x-auto lg:right-6 lg:bottom-20 lg:w-[400px] max-w-[420px] ml-auto rounded-2xl shadow-2xl border flex flex-col max-h-[64vh] overflow-hidden";

  return (
    <>
        <div
          className={panelSizeClass}
          data-testid="chat-panel"
          data-size={expanded ? "expanded" : "normal"}
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
            <button
              type="button"
              onClick={() => {
                const next = !speechToText;
                setSpeechToTextEnabled(next);
                if (!next && recRef.current) {
                  try {
                    recRef.current.stop();
                  } catch {
                    /* ignore */
                  }
                }
                showToast(next ? "Speech to text on" : "Speech to text off");
              }}
              className={`text-[11px] font-bold px-2 py-1 rounded-full shrink-0 border border-white/30 ${
                speechToText ? "bg-white/20" : "bg-black/20 opacity-80"
              }`}
              aria-label={speechToText ? "Turn speech to text off" : "Turn speech to text on"}
              aria-pressed={speechToText}
              data-testid="chat-speech-toggle"
              title="Speech to text"
            >
              🎤 {speechToText ? "On" : "Off"}
            </button>
            <button
              type="button"
              onClick={() => {
                const next = expanded ? "normal" : "expanded";
                setChatPanelSize(next);
                showToast(next === "expanded" ? "Chat expanded" : "Chat smaller");
              }}
              className="text-white w-8 h-8 rounded-full flex items-center justify-center shrink-0 border border-white/25 bg-white/10"
              aria-label={expanded ? "Make chat smaller" : "Expand chat"}
              aria-pressed={expanded}
              data-testid="chat-size-toggle"
              title={expanded ? "Smaller" : "Bigger"}
            >
              {expanded ? "⤡" : "⤢"}
            </button>
            <button
              type="button"
              onClick={() => {
                stopAssistantSpeech();
                setChatOpen(false);
              }}
              className="text-white w-8 h-8 rounded-full flex items-center justify-center shrink-0"
              aria-label="Minimize chat"
              data-testid="chat-minimize"
              title="Minimize"
            >
              ✕
            </button>
          </div>
          <div
            ref={logRef}
            data-testid="chat-log"
            onScroll={onLogScroll}
            className="flex-1 overflow-y-auto lg-scroll-hidden p-3 min-h-[120px]"
          >
            {msgs.length ? (
              msgs.map((m, i) => {
                const parsed = isAgentMsg(m) ? parseReplyButtons(m.text) : { body: m.text, buttons: [] };
                return (
                  <div
                    key={m.id || i}
                    className={`max-w-[82%] min-w-0 rounded-2xl px-3 py-2 text-sm mb-2 ${
                      isAgentMsg(m)
                        ? "chat-msg-agent rounded-bl-md"
                        : "chat-msg-you ml-auto rounded-br-md"
                    }`}
                  >
                    {m.imageUrl ? (
                      <img src={m.imageUrl} alt="" className="rounded-lg max-h-28 mb-1 object-contain bg-white/10" />
                    ) : m.fileName ? (
                      m.fileUrl ? (
                        <a
                          href={m.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-[11px] font-semibold underline mb-1 opacity-90"
                        >
                          📎 {m.fileName}
                        </a>
                      ) : (
                        <span className="block text-[11px] font-semibold mb-1 opacity-90">📎 {m.fileName}</span>
                      )
                    ) : null}
                    {parsed.body}
                    {parsed.buttons.length ? (
                      <ChatReplyButtons
                        buttons={parsed.buttons}
                        onPick={pickReplyButton}
                        showLetters={!!parsed.buttons[0]?.letter}
                      />
                    ) : null}
                    <span className="chat-msg-meta block text-[10px] mt-0.5 text-right" data-testid="msg-meta">
                      {isAgentMsg(m) ? agentLabel(m) : statusLabel(m.status)}
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="chat-empty text-sm text-center py-5 px-2">
                Ask about customers, jobs, invoices, payments, or reports. Photos and voice welcome.
                Expand for a bigger window; ✕ minimizes.
              </div>
            )}
            {working && (
              <div
                className="chat-typing max-w-[82%] rounded-2xl rounded-bl-md px-3 py-2 text-sm mb-2 flex items-center gap-1.5"
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
            <div className="chat-empty px-3 pb-1 text-[11px] text-center" data-testid="chat-hint">
              Same brain as Telegram Israel · helps in-app (invoices, payments, lookups) · change requests OK · no silent app code changes
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
              className="chat-chip shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full"
              onClick={() => submitDevTask(text)}
              data-testid="chat-action-task"
            >
              Dev task
            </button>
            {activeJob && (
              <button
                type="button"
                className="chat-chip shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full"
                onClick={() => setJobSheet(true)}
                data-testid="chat-action-job"
              >
                Update job
              </button>
            )}
            {(apptCtx || activeJob) && (
              <button
                type="button"
                className="chat-chip shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full"
                onClick={openAppointment}
                data-testid="chat-action-appt"
              >
                Appointment
              </button>
            )}
            <button
              type="button"
              className="chat-chip shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full"
              onClick={attachContact}
              data-testid="chat-action-contact"
            >
              Contact
            </button>
          </div>
          <div className="chat-slash-hint chat-empty px-3 pb-1 text-[10px]" data-testid="chat-slash-hint">
            {CHAT_SLASH_HINT}
          </div>
          <input
            ref={imageInputRef}
            type="file"
            className="hidden"
            onChange={onChatAttach}
            data-testid="chat-file-input"
          />
          {/* Composer: one bubble — text on top, + (left) and send (right) on the bottom row. */}
          <div className="chat-composer-wrap p-3 border-t" data-testid="chat-composer">
            {emojiOpen ? (
              <div
                className="chat-emoji-picker mb-2 rounded-2xl border p-2 flex flex-wrap gap-1"
                data-testid="chat-emoji-picker"
                role="listbox"
                aria-label="Emojis"
              >
                {CHAT_EMOJIS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    className="w-9 h-9 rounded-xl text-lg hover:opacity-80 active:scale-95"
                    onClick={() => insertEmoji(em)}
                    aria-label={`Insert ${em}`}
                  >
                    {em}
                  </button>
                ))}
              </div>
            ) : null}
            {plusOpen ? (
              <div
                className="chat-plus-menu mb-2 rounded-2xl border shadow-sm overflow-hidden"
                data-testid="chat-plus-menu"
                role="menu"
              >
                <button
                  type="button"
                  role="menuitem"
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-semibold border-b border-slate-100/20"
                  onClick={() => {
                    setPlusOpen(false);
                    setEmojiOpen(true);
                  }}
                  data-testid="chat-plus-emoji"
                >
                  <span className="text-base w-6 text-center">😊</span>
                  Emoji
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-semibold border-b border-slate-100/20 disabled:opacity-50"
                  onClick={() => {
                    setPlusOpen(false);
                    imageInputRef.current?.click();
                  }}
                  disabled={imageBusy}
                  aria-label="Attach file"
                  data-testid="chat-attach-file"
                >
                  <span className="text-base w-6 text-center">
                    {imageBusy ? (
                      <span className="inline-block w-4 h-4 border-2 border-slate-300 border-t-brand rounded-full animate-spin" />
                    ) : (
                      "📎"
                    )}
                  </span>
                  Photo or file
                </button>
                {speechToText ? (
                  <button
                    type="button"
                    role="menuitem"
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-semibold"
                    onClick={() => {
                      setPlusOpen(false);
                      toggleMic();
                    }}
                    data-testid="chat-plus-voice"
                  >
                    <span className="text-base w-6 text-center">🎤</span>
                    Voice note
                  </button>
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-semibold opacity-70"
                    onClick={() => {
                      setPlusOpen(false);
                      showToast("Turn on speech to text in Company settings");
                    }}
                    data-testid="chat-plus-voice"
                  >
                    <span className="text-base w-6 text-center">🎤</span>
                    Voice note (off in settings)
                  </button>
                )}
              </div>
            ) : null}
            <div
              className="chat-composer-bubble rounded-[22px] border shadow-inner focus-within:border-brand/40 focus-within:ring-2 focus-within:ring-brand/15 transition-shadow"
              data-testid="chat-composer-bubble"
            >
              <textarea
                ref={inputRef}
                className="chat-composer-input w-full bg-transparent border-0 outline-none resize-none overflow-y-auto lg-scroll-hidden leading-snug px-3.5 pt-2.5 pb-1 min-h-[2.5rem] text-sm"
                rows={1}
                placeholder="Message Israel…"
                value={text}
                onChange={(e) => setComposerText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                aria-label="Chat message"
                data-testid="chat-message-input"
              />
              <div className="flex items-center justify-between gap-2 px-2 pb-2 pt-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setEmojiOpen(false);
                    setPlusOpen((o) => !o);
                  }}
                  aria-label={plusOpen ? "Close attach menu" : "Open attach menu"}
                  aria-expanded={plusOpen}
                  className={`w-9 h-9 rounded-full shrink-0 text-lg font-bold leading-none flex items-center justify-center transition-colors ${
                    plusOpen ? "chat-msg-you" : "chat-chip border"
                  }`}
                  data-testid="chat-plus"
                >
                  +
                </button>
                <div className="flex items-center gap-1.5">
                  {speechToText && rec ? (
                    <button
                      ref={micBtn}
                      type="button"
                      onClick={toggleMic}
                      aria-label="Stop voice input"
                      className="w-9 h-9 rounded-full text-base shrink-0 bg-red-100 transition-transform"
                      data-testid="chat-mic"
                    >
                      🎤
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={send}
                    aria-label="Send message"
                    className="chat-msg-you w-9 h-9 rounded-full shrink-0 text-base flex items-center justify-center disabled:opacity-40"
                    disabled={!text.trim()}
                    data-testid="chat-send"
                  >
                    ➤
                  </button>
                </div>
              </div>
            </div>
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
            setPendingPaymentImage(null);
          }}
        />
      ) : null}
    </>
  );
}
