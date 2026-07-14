// LE Voice Flow — polish transcript and insert into focused field (EN + HE).

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

/** Whether Web Speech API is available. */
export function speechRecognitionSupported() {
  if (typeof window === "undefined") return false;
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

/** Create a speech recognizer with silent listen + Android silence-timeout restart. */
export function createSilentRecognizer({ lang = "en-US", onFinal, onError, onEnd } = {}) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;

  let rec = null;
  let finals = "";
  let stopped = false;
  let restartTimer = null;

  const clearRestart = () => {
    if (restartTimer) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }
  };

  const start = () => {
    if (stopped) return;
    rec = new SR();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = true;

    rec.onresult = (ev) => {
      let interim = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) finals += r[0].transcript;
        else interim += r[0].transcript;
      }
      onFinal?.(finals + interim, finals);
      clearRestart();
      restartTimer = setTimeout(() => {
        if (!stopped && rec) {
          try {
            rec.stop();
          } catch {}
        }
      }, 8000);
    };

    rec.onerror = (e) => {
      if (e.error === "no-speech" && !stopped) {
        try {
          rec.start();
        } catch {}
        return;
      }
      onError?.(e);
    };

    rec.onend = () => {
      clearRestart();
      if (!stopped) {
        try {
          start();
        } catch {
          onEnd?.(finals);
        }
      } else {
        onEnd?.(finals);
      }
    };

    try {
      rec.start();
    } catch (err) {
      onError?.(err);
    }
  };

  start();

  return {
    stop() {
      stopped = true;
      clearRestart();
      if (rec) {
        try {
          rec.stop();
        } catch {}
        rec = null;
      }
      return finals;
    },
    getTranscript() {
      return finals;
    },
  };
}