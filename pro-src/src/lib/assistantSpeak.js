// Speak Israel chat replies aloud using the browser speech engine.
// Voice presets map to available English voices when present.

import { getAssistantVoiceId, isAssistantSpeakEnabled } from "./appSettings.js";

/** Strip reply chrome so TTS doesn't read button markers or meta. */
export function plainTextForSpeech(raw) {
  let t = String(raw || "");
  // Drop ---BUTTONS--- blocks and everything after
  const btn = t.indexOf("---BUTTONS---");
  if (btn >= 0) t = t.slice(0, btn);
  // Drop leading widget-style lines that are just emoji labels if huge
  t = t
    .replace(/\*\*[^*]+\*\*/g, (m) => m.replace(/\*/g, ""))
    .replace(/[•·]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t.slice(0, 800);
}

function listVoices() {
  try {
    if (typeof speechSynthesis === "undefined") return [];
    return speechSynthesis.getVoices() || [];
  } catch {
    return [];
  }
}

/**
 * Pick a browser voice for a preset id.
 * @param {string} presetId
 * @param {SpeechSynthesisVoice[]} [voices]
 */
export function pickVoiceForPreset(presetId, voices) {
  const list = voices || listVoices();
  if (!list.length) return null;
  const id = String(presetId || "auto");
  if (id === "auto" || !id) {
    return list.find((v) => /^en(-|_)/i.test(v.lang)) || list[0] || null;
  }
  // Exact URI / name match
  const exact = list.find((v) => v.voiceURI === id || v.name === id);
  if (exact) return exact;
  const en = list.filter((v) => /^en(-|_)/i.test(v.lang));
  const pool = en.length ? en : list;
  const name = (v) => String(v.name || "").toLowerCase();
  if (id === "clear-male") {
    return (
      pool.find((v) => /daniel|alex|david|fred|male|guy|aaron|tom/i.test(name(v))) ||
      pool.find((v) => !/female|samantha|karen|moira|zira|susan|victoria/i.test(name(v))) ||
      pool[0]
    );
  }
  if (id === "clear-female") {
    return (
      pool.find((v) => /samantha|karen|moira|zira|susan|victoria|female|siri|fiona/i.test(name(v))) ||
      pool[0]
    );
  }
  if (id === "warm") {
    return (
      pool.find((v) => /samantha|moira|karen|serena|soft|warm/i.test(name(v))) ||
      pool.find((v) => /female/i.test(name(v))) ||
      pool[0]
    );
  }
  if (id === "crisp") {
    return (
      pool.find((v) => /google|microsoft|premium|enhanced|neural/i.test(name(v))) || pool[0]
    );
  }
  return pool[0] || null;
}

/** Cancel any in-flight utterance. */
export function stopAssistantSpeech() {
  try {
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
}

/**
 * Speak plain text with the user's preferred voice (if speak-aloud is on).
 * No-op when disabled, empty, or speech API missing.
 */
export function speakAssistantText(raw, opts = {}) {
  if (!opts.force && !isAssistantSpeakEnabled()) return false;
  const text = plainTextForSpeech(raw);
  if (!text) return false;
  try {
    if (typeof speechSynthesis === "undefined" || typeof SpeechSynthesisUtterance === "undefined") {
      return false;
    }
    stopAssistantSpeech();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.02;
    u.pitch = 1;
    const voice = pickVoiceForPreset(opts.voiceId || getAssistantVoiceId());
    if (voice) u.voice = voice;
    speechSynthesis.speak(u);
    return true;
  } catch {
    return false;
  }
}
