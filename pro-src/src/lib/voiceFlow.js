// Wispr-style voice bubble — polish transcript and insert into focused field.

/** Light cleanup before inserting voice text. */
export function polishVoiceText(raw) {
  let t = String(raw || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  t = t.charAt(0).toUpperCase() + t.slice(1);
  if (!/[.!?]$/.test(t)) t += ".";
  return t;
}

/** Insert text at the cursor in the active input, textarea, or contenteditable. */
export function insertTextAtFocus(text) {
  const el = document.activeElement;
  if (!el || !text) return false;
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

/** Whether Web Speech API is available. */
export function speechRecognitionSupported() {
  if (typeof window === "undefined") return false;
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}