// Wispr-style voice bubble — polish transcript and insert into focused field.

const LIST_INTRO =
  /^(first(?:\s+thing)?|second|third|fourth|fifth|next|then|also|finally|number\s+(?:one|two|three|four|five)|\d+)[,:]?\s+/i;

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

/** Track focus globally — call once at app startup. */
export function trackVoiceFocus() {
  if (typeof document === "undefined") return () => {};
  const onFocus = (e) => {
    if (isTextField(e.target)) lastTextTarget = e.target;
  };
  document.addEventListener("focusin", onFocus, true);
  return () => document.removeEventListener("focusin", onFocus, true);
}

export function getLastTextTarget() {
  return lastTextTarget;
}

export function setLastTextTarget(el) {
  if (isTextField(el)) lastTextTarget = el;
}

function punctuateSentence(s) {
  let t = s.trim();
  if (!t) return "";
  t = t.charAt(0).toUpperCase() + t.slice(1);
  if (!/[.!?]$/.test(t)) t += ".";
  return t;
}

function spokenPunctuation(t) {
  return String(t || "")
    .replace(/\bnew\s+paragraph\b/gi, "\n\n")
    .replace(/\bnew\s+line\b/gi, "\n")
    .replace(/\bexclamation\s+(?:mark|point)\b/gi, "!")
    .replace(/\bquestion\s+mark\b/gi, "?")
    .replace(/\bcomma\b/gi, ",")
    .replace(/\bperiod\b/gi, ".")
    .replace(/\bcolon\b/gi, ":")
    .replace(/\bsemicolon\b/gi, ";");
}

function splitListItems(t) {
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

/** Wispr-style cleanup — punctuation, lists, spacing; no live raw dump. */
export function polishVoiceText(raw) {
  let t = spokenPunctuation(raw).replace(/\s+/g, " ").trim();
  if (!t) return "";

  const pieces = splitListItems(t);
  if (pieces.length > 1) {
    return pieces
      .map((p, i) => {
        const stripped = p.replace(LIST_INTRO, "").trim();
        const body = punctuateSentence(stripped).replace(/\.$/, "");
        return `${i + 1}. ${body}`;
      })
      .join("\n");
  }

  t = t.replace(/\s+([,.;:!?])/g, "$1");
  t = t.replace(/([,;:])(?=\S)/g, "$1 ");
  return punctuateSentence(t);
}

function setFieldValue(el, text) {
  if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    const val = el.value || "";
    const next = val.slice(0, start) + text + val.slice(end);
    el.value = next;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    const pos = start + text.length;
    el.selectionStart = pos;
    el.selectionEnd = pos;
    el.focus();
    return true;
  }
  if (el.isContentEditable) {
    el.focus();
    const ok = document.execCommand("insertText", false, text);
    if (!ok) el.textContent = (el.textContent || "") + text;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }
  return false;
}

/** Insert text at the cursor in the active or last-focused field. */
export function insertTextAtFocus(text, target) {
  if (!text) return false;
  const el = (target && isTextField(target) ? target : null) || getLastTextTarget() || document.activeElement;
  if (!isTextField(el)) return false;
  return setFieldValue(el, text);
}

/** Whether Web Speech API is available. */
export function speechRecognitionSupported() {
  if (typeof window === "undefined") return false;
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}