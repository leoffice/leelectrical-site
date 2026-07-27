// LE Voice Flow — polish transcript and insert into focused field (EN + HE).
import { functionsBase } from "./functionsBase.js";

const LIST_INTRO =
  /^(first(?:\s+thing)?|second|third|fourth|fifth|next|then|also|finally|number\s+(?:one|two|three|four|five)|\d+)[,:]?\s+/i;

const FILLERS =
  /\b(um+|uh+|er+|ah+|like|you know|i mean|sort of|kind of)\b[,.]?\s*/gi;

/** Remember the last real text field so the bubble never steals focus. */
let lastTextTarget = null;

function isTextField(el) {
  if (!el || el === document.body) return false;
  if (el.tagName === "INPUT") {
    const type = (el.type || "text").toLowerCase();
    return !["button", "submit", "checkbox", "radio", "file", "hidden", "image", "reset"].includes(type);
  }
  return el.tagName === "TEXTAREA" || !!el.isContentEditable;
}

export function getLastTextTarget() {
  return lastTextTarget;
}

export function setLastTextTarget(el) {
  if (isTextField(el)) lastTextTarget = el;
}

/**
 * Subscribe to text-field focus so the mic can appear ONLY when a field is
 * active and stay hidden otherwise. Calls `onChange(field|null)`.
 *
 * The mic UI opts out of hiding by carrying [data-voice-ui] — clicking it must
 * not count as "left the field". A short grace period covers the focus hop
 * between a field and the mic button (or between two fields inside a sheet).
 */
export function subscribeTextFocus(onChange) {
  if (typeof document === "undefined") return () => {};
  let hideTimer = null;
  const clearHide = () => {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  };
  const onFocusIn = (e) => {
    if (isTextField(e.target)) {
      lastTextTarget = e.target;
      clearHide();
      onChange(e.target);
    }
  };
  const onFocusOut = (e) => {
    const next = e.relatedTarget;
    if (next && (isTextField(next) || (next.closest && next.closest("[data-voice-ui]")))) return;
    clearHide();
    hideTimer = setTimeout(() => {
      const active = document.activeElement;
      if (isTextField(active) || (active && active.closest && active.closest("[data-voice-ui]"))) return;
      onChange(null);
    }, 180);
  };
  document.addEventListener("focusin", onFocusIn, true);
  document.addEventListener("focusout", onFocusOut, true);
  return () => {
    clearHide();
    document.removeEventListener("focusin", onFocusIn, true);
    document.removeEventListener("focusout", onFocusOut, true);
  };
}

/** Pick the best MediaRecorder audio mime the browser can produce for xAI STT. */
export function pickAudioMimeType() {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4", // Safari / iOS
    "audio/mpeg",
    "audio/ogg;codecs=opus",
  ];
  for (const t of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(t)) return t;
    } catch {
      /* older engines throw */
    }
  }
  return "";
}

/** Whether tap-to-dictate (mic capture) is possible in this browser. */
export function audioCaptureSupported() {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined"
  );
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const res = String(reader.result || "");
      const comma = res.indexOf(",");
      resolve(comma >= 0 ? res.slice(comma + 1) : res);
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * Transcribe a recorded audio Blob via the xAI STT proxy (voice-stt function).
 * Returns { ok, text, dryRun, error }. Never throws.
 */
export async function transcribeAudioBlob(blob, { language = "", keyterms = [], apiBase } = {}) {
  if (!blob || !blob.size) return { ok: false, text: "", error: "empty" };
  let base = apiBase;
  if (!base) base = typeof functionsBase === "function" ? functionsBase() : "/.netlify/functions";
  let audio;
  try {
    audio = await blobToBase64(blob);
  } catch {
    return { ok: false, text: "", error: "encode failed" };
  }
  try {
    const r = await fetch(`${base}/voice-stt`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ audio, mime: blob.type || "audio/webm", language, keyterms }),
    });
    const data = await r.json().catch(() => ({}));
    if (r.ok && data?.ok) return { ok: true, text: String(data.text || "").trim() };
    return {
      ok: false,
      text: "",
      dryRun: !!data?.dryRun,
      error: data?.error || `STT ${r.status}`,
    };
  } catch (e) {
    return { ok: false, text: "", error: String(e?.message || e) };
  }
}

function hasHebrew(t) {
  return /[\u0590-\u05FF]/.test(t);
}

function capitalizeSentences(t, rtl) {
  if (rtl) return t;
  return t
    .replace(/(^|[.!?]\s+|\n+)([a-z])/g, (_, pre, c) => pre + c.toUpperCase());
}

function punctuateSentence(s, rtl) {
  let t = s.trim();
  if (!t) return "";
  if (!rtl) t = t.charAt(0).toUpperCase() + t.slice(1);
  if (!/[.!?]$/.test(t) && !/[.!?؟]$/.test(t)) t += ".";
  return t;
}

function spokenPunctuation(t) {
  let out = String(t || "");
  // Hebrew — \b does not work on Hebrew letters
  out = out
    .replace(/(^|\s)פסיק(?=\s|$)/g, "$1,")
    .replace(/(^|\s)נקודה(?=\s|$)/g, "$1.")
    .replace(/שורה\s+חדשה/g, "\n")
    .replace(/פסקה\s+חדשה/g, "\n\n")
    .replace(/סימן\s+שאלה/g, "?")
    .replace(/סימן\s+קריאה/g, "!")
    .replace(/(^|\s)נקודתיים(?=\s|$)/g, "$1:");
  // English spoken punctuation
  out = out
    .replace(/\bnew\s+paragraph\b/gi, "\n\n")
    .replace(/\bnew\s+line\b/gi, "\n")
    .replace(/\bexclamation\s+(?:mark|point)\b/gi, "!")
    .replace(/\bquestion\s+mark\b/gi, "?")
    .replace(/\bcomma\b/gi, ",")
    .replace(/\bperiod\b/gi, ".")
    .replace(/\bcolon\b/gi, ":")
    .replace(/\bsemicolon\b/gi, ";");
  return out;
}

function removeFillers(t) {
  return t.replace(FILLERS, " ").replace(/[ \t]{2,}/g, " ").trim();
}

function dedupeWords(t) {
  return t.replace(/\b(\w+)(\s+\1\b)+/gi, "$1");
}

function hasExplicitNewlineCommand(raw) {
  return /\b(new\s+line|new\s+paragraph|שורה\s+חדשה|פסקה\s+חדשה)\b/i.test(raw);
}

function countListMarkers(t) {
  const lower = t.toLowerCase();
  const markers = ["first", "second", "third", "fourth", "fifth", "next", "then", "also", "finally", "number one", "number two", "number three"];
  let count = 0;
  for (const m of markers) {
    const re = new RegExp(`(?:^|\\s)${m.replace(" ", "\\s+")}(?:\\s|$|[,:])`, "gi");
    const hits = lower.match(re);
    if (hits) count += hits.length;
  }
  return count;
}

function splitListItems(t, raw) {
  if (hasExplicitNewlineCommand(raw)) return [t];
  if (countListMarkers(t) < 2) return [t];

  const parts = [];
  let buf = "";
  const tokens = t.split(/\s+/);
  for (let i = 0; i < tokens.length; i++) {
    const chunk = tokens.slice(i).join(" ");
    const m = chunk.match(LIST_INTRO);
    if (m && buf.trim()) {
      parts.push(buf.trim());
      buf = chunk.slice(m[0].length);
      i += m[0].trim().split(/\s+/).length - 1;
    } else {
      buf += (buf ? " " : "") + tokens[i];
    }
  }
  if (buf.trim()) parts.push(buf.trim());
  return parts.length > 1 ? parts : [t];
}

/** Detect rambling/repetitive dictation that needs semantic rewrite (Wispr-style). */
export function needsSmartPolish(raw) {
  const t = String(raw || "").trim();
  if (t.length < 60) return false;
  const lower = t.toLowerCase();
  const words = lower.split(/\s+/).filter(Boolean);
  if (words.length < 12) return false;

  for (let win = Math.min(10, Math.floor(words.length / 3)); win >= 5; win--) {
    for (let i = 0; i <= words.length - win * 2; i++) {
      const slice = words.slice(i, i + win).join(" ");
      const rest = words.slice(i + win).join(" ");
      if (slice.length > 18 && rest.includes(slice)) return true;
    }
  }

  if (/\b[1-6]\.\s/.test(t) && t.length > 120) return true;
  return t.length > 240;
}

/** Offline dedupe when AI polish is unavailable. */
export function consolidateRepetition(text) {
  let t = String(text || "").trim();
  if (!t) return "";

  const numbered = t.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  if (numbered.length > 1 && /^\d+\.\s/.test(numbered[0])) {
    const seen = [];
    const unique = [];
    for (const p of numbered) {
      const body = p.replace(/^\d+\.\s*/, "").trim();
      const norm = body.toLowerCase().replace(/\s+/g, " ");
      if (seen.some((s) => s === norm || (s.length > 24 && norm.includes(s)) || (norm.length > 24 && s.includes(norm)))) continue;
      seen.push(norm);
      unique.push(body);
    }
    if (unique.length < numbered.length) {
      return unique.map((p, i) => `${i + 1}. ${p}`).join("\n");
    }
  }

  const sentences = t.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 20);
  if (sentences.length < 2) return t;
  const kept = [];
  for (const s of sentences) {
    const norm = s.toLowerCase().replace(/\s+/g, " ");
    const dup = kept.some((k) => {
      const kn = k.toLowerCase().replace(/\s+/g, " ");
      return kn === norm || (kn.length > 30 && norm.includes(kn.slice(0, 30))) || (norm.length > 30 && kn.includes(norm.slice(0, 30)));
    });
    if (!dup) kept.push(s);
  }
  return kept.length < sentences.length ? kept.join(" ") : t;
}

/** Wispr-style cleanup — punctuation, lists, spacing; bilingual EN+HE. */
export function polishVoiceText(raw) {
  let t = spokenPunctuation(raw);
  t = removeFillers(t);
  t = dedupeWords(t);
  t = t.replace(/[^\S\n]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!t) return "";

  const rtl = hasHebrew(t);
  const pieces = splitListItems(t, raw);
  if (pieces.length > 1) {
    return pieces
      .map((p, i) => {
        const stripped = p.replace(LIST_INTRO, "").trim();
        const body = punctuateSentence(stripped, rtl).replace(/\.$/, "");
        return `${i + 1}. ${body}`;
      })
      .join("\n");
  }

  t = t.replace(/[ \t]+([,.;:!?])/g, "$1");
  t = t.replace(/([,;:])(?=\S)/g, "$1 ");
  t = capitalizeSentences(punctuateSentence(t, rtl), rtl);
  return t;
}

/**
 * Rule polish + optional Grok semantic rewrite (competition / Wispr-style).
 * Falls back to local dedupe if the API is down.
 */
export async function polishVoiceTextSmart(raw, { apiBase } = {}) {
  const base = polishVoiceText(raw);
  if (!base) return "";
  if (!needsSmartPolish(raw)) return base;

  const local = consolidateRepetition(base);
  let baseUrl = apiBase;
  if (!baseUrl) baseUrl = typeof functionsBase === "function" ? functionsBase() : "/.netlify/functions";

  try {
    const r = await fetch(`${baseUrl}/voice-polish`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ raw, prePolished: base }),
    });
    const data = await r.json();
    if (data?.ok && data.text) return String(data.text).trim();
    if (data?.fallback) return consolidateRepetition(String(data.fallback));
  } catch {
    /* offline */
  }
  return local !== base ? local : base;
}

function setNativeValue(el, value) {
  const proto = Object.getPrototypeOf(el);
  const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
  if (descriptor?.set) descriptor.set.call(el, value);
  else el.value = value;
}

function setFieldValue(el, text) {
  if (!el || !text) return false;
  try {
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? start;
      const val = el.value || "";
      const next = val.slice(0, start) + text + val.slice(end);
      if (typeof el.setRangeText === "function") {
        el.setRangeText(text, start, end, "end");
      } else {
        setNativeValue(el, next);
        const pos = start + text.length;
        el.selectionStart = pos;
        el.selectionEnd = pos;
      }
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.focus({ preventScroll: true });
      return true;
    }
    if (el.isContentEditable) {
      el.focus({ preventScroll: true });
      const sel = window.getSelection();
      if (sel && sel.rangeCount) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(document.createTextNode(text));
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      } else {
        const ok = document.execCommand("insertText", false, text);
        if (!ok) el.textContent = (el.textContent || "") + text;
      }
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

/** Insert text at the cursor in the active or last-focused field. */
export function insertTextAtFocus(text, target) {
  if (!text) return false;
  const active = document.activeElement;
  const el =
    (target && isTextField(target) ? target : null) ||
    (isTextField(active) ? active : null) ||
    getLastTextTarget();
  if (!isTextField(el)) return false;
  return setFieldValue(el, text);
}