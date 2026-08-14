// App preferences — speech-to-text + company logo + QuickBooks feature (local device).
import { useEffect, useState } from "react";

export const SPEECH_TO_TEXT_KEY = "lepro_speech_to_text";
export const COMPANY_LOGO_KEY = "lepro_company_logo";
export const QUICKBOOKS_FEATURE_KEY = "lepro_feature_quickbooks";
/** Send/view through QB UI — separate from backend sync integration. */
export const QUICKBOOKS_DOCS_FEATURE_KEY = "lepro_feature_quickbooks_docs";
/** Per-document send-through-QB switches; unset falls back to the umbrella above. */
export const QUICKBOOKS_INVOICES_FEATURE_KEY = "lepro_feature_quickbooks_invoices";
export const QUICKBOOKS_ESTIMATES_FEATURE_KEY = "lepro_feature_quickbooks_estimates";

/** Chat bubble panel size: normal | expanded | minimized */
export const CHAT_PANEL_SIZE_KEY = "lepro_chat_panel_size";
/** Assistant speak-aloud replies on/off */
export const ASSISTANT_SPEAK_KEY = "lepro_assistant_speak";
/** Preferred TTS voice preset id */
export const ASSISTANT_VOICE_KEY = "lepro_assistant_voice";

export const ASSISTANT_VOICE_PRESETS = [
  { id: "auto", label: "Auto (device default)", description: "Browser picks a clear English voice" },
  { id: "clear-male", label: "Clear male", description: "Steady, easy to follow" },
  { id: "clear-female", label: "Clear female", description: "Warm and clear" },
  { id: "warm", label: "Warm", description: "Friendly office tone" },
  { id: "crisp", label: "Crisp", description: "Short and direct" },
];

export const SETTINGS_EVENT = "lepro-settings";

const DEFAULT_LOGO = () =>
  typeof import.meta !== "undefined" && import.meta.env?.BASE_URL
    ? import.meta.env.BASE_URL + "le-logo.png?v=6"
    : "/app/pro/le-logo.png?v=6";

/**
 * In-memory mirror of the company logo. Survives localStorage quota failures
 * for the rest of the session so View Local Invoice still picks up an upload.
 */
let companyLogoMemory = "";

function storage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function notify() {
  try {
    globalThis.dispatchEvent?.(new Event(SETTINGS_EVENT));
  } catch {
    /* ignore */
  }
}

/** Speech-to-text (voice bubble + chat mic). Default ON. */
export function isSpeechToTextEnabled() {
  const ls = storage();
  if (!ls) return true;
  try {
    const v = ls.getItem(SPEECH_TO_TEXT_KEY);
    if (v === null || v === undefined || v === "") return true;
    return v === "1" || v === "true";
  } catch {
    return true;
  }
}

export function setSpeechToTextEnabled(on) {
  const ls = storage();
  if (!ls) return;
  try {
    ls.setItem(SPEECH_TO_TEXT_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
  notify();
}

/**
 * Settings → Features → QuickBooks. Default ON so LE Electrical keeps
 * full QB paths until someone turns it off for local-only / white-label.
 */
export function isQuickbooksFeatureEnabled() {
  const ls = storage();
  if (!ls) return true;
  try {
    const v = ls.getItem(QUICKBOOKS_FEATURE_KEY);
    if (v === null || v === undefined || v === "") return true;
    return v === "1" || v === "true";
  } catch {
    return true;
  }
}

export function setQuickbooksFeatureEnabled(on) {
  const ls = storage();
  if (!ls) return;
  try {
    ls.setItem(QUICKBOOKS_FEATURE_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
  notify();
}

/**
 * Settings → Features → Send & view through QuickBooks.
 * Default OFF (Levi 2026-07-23): local send/view only; integration/sync still runs.
 * Turn ON only when you want send-through-QB / view-in-QB options again.
 */
export function isQuickbooksDocsFeatureEnabled() {
  const ls = storage();
  if (!ls) return false;
  try {
    const v = ls.getItem(QUICKBOOKS_DOCS_FEATURE_KEY);
    // Unset = off (new default). Explicit "1"/"true" turns docs UI back on.
    if (v === null || v === undefined || v === "") return false;
    return v === "1" || v === "true";
  } catch {
    return false;
  }
}

export function setQuickbooksDocsFeatureEnabled(on) {
  const ls = storage();
  if (!ls) return;
  try {
    ls.setItem(QUICKBOOKS_DOCS_FEATURE_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
  notify();
}

function perDocKey(docKind) {
  return docKind === "estimate" ? QUICKBOOKS_ESTIMATES_FEATURE_KEY : QUICKBOOKS_INVOICES_FEATURE_KEY;
}

/**
 * Settings → Special features → QuickBooks → send invoices / send estimates.
 * Unset on this device means "whatever the umbrella docs switch says", so a
 * device that never saw the split keeps its old behaviour.
 */
export function isQuickbooksDocFeatureEnabled(docKind) {
  const ls = storage();
  if (!ls) return false;
  try {
    const v = ls.getItem(perDocKey(docKind));
    if (v === null || v === undefined || v === "") return isQuickbooksDocsFeatureEnabled();
    return v === "1" || v === "true";
  } catch {
    return false;
  }
}

export function setQuickbooksDocFeatureEnabled(docKind, on) {
  const ls = storage();
  if (!ls) return;
  try {
    ls.setItem(perDocKey(docKind), on ? "1" : "0");
  } catch {
    /* ignore */
  }
  notify();
}

/** Custom logo data URL, or empty string when using the built-in logo. */
export function getCompanyLogoDataUrl() {
  if (companyLogoMemory) return companyLogoMemory;
  const ls = storage();
  if (!ls) return "";
  try {
    return ls.getItem(COMPANY_LOGO_KEY) || "";
  } catch {
    return "";
  }
}

/** Resolved src for <img> — custom upload or default company file. */
export function getCompanyLogoSrc() {
  const custom = getCompanyLogoDataUrl();
  if (custom) return custom;
  return DEFAULT_LOGO();
}

/**
 * Persist the company logo for PDFs + chrome.
 * Always updates the in-memory cache; localStorage is best-effort (quota).
 */
export function setCompanyLogoDataUrl(dataUrl) {
  const next = dataUrl ? String(dataUrl) : "";
  companyLogoMemory = next;
  const ls = storage();
  if (ls) {
    try {
      if (next) ls.setItem(COMPANY_LOGO_KEY, next);
      else ls.removeItem(COMPANY_LOGO_KEY);
    } catch {
      /* quota / private mode — memory still holds the logo this session */
    }
  }
  notify();
}

export function clearCompanyLogo() {
  setCompanyLogoDataUrl("");
}

/**
 * Read an image file, downscale to max edge, return a JPEG data URL.
 * Keeps localStorage size reasonable for a company logo.
 */
export function readLogoFileAsDataUrl(file, maxEdge = 384) {
  return new Promise((resolve, reject) => {
    if (!file || !String(file.type || "").startsWith("image/")) {
      reject(new Error("Pick an image file"));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.onload = () => {
      const raw = String(reader.result || "");
      if (!raw.startsWith("data:image/")) {
        reject(new Error("Not an image"));
        return;
      }
      const img = new Image();
      img.onerror = () => reject(new Error("Could not load image"));
      img.onload = () => {
        try {
          let { width, height } = img;
          if (!width || !height) {
            resolve(raw);
            return;
          }
          const edge = Math.max(width, height);
          if (edge > maxEdge) {
            const scale = maxEdge / edge;
            width = Math.round(width * scale);
            height = Math.round(height * scale);
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(raw);
            return;
          }
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          // Always JPEG so invoice/estimate PDFs can embed the logo without
          // an extra conversion step (PDF writer uses DCTDecode only).
          const out = canvas.toDataURL("image/jpeg", 0.9);
          resolve(out);
        } catch (e) {
          reject(e);
        }
      };
      img.src = raw;
    };
    reader.readAsDataURL(file);
  });
}


export function getChatPanelSize() {
  try {
    const ls = storage();
    if (!ls) return "normal";
    const v = ls.getItem(CHAT_PANEL_SIZE_KEY);
    if (v === "expanded" || v === "minimized" || v === "normal") return v;
  } catch {
    /* ignore */
  }
  return "normal";
}

export function setChatPanelSize(size) {
  const next = size === "expanded" || size === "minimized" ? size : "normal";
  try {
    const ls = storage();
    if (ls) {
      if (next === "normal") ls.removeItem(CHAT_PANEL_SIZE_KEY);
      else ls.setItem(CHAT_PANEL_SIZE_KEY, next);
    }
  } catch {
    /* ignore */
  }
  notify();
  return next;
}

export function isAssistantSpeakEnabled() {
  try {
    const ls = storage();
    if (!ls) return false;
    return ls.getItem(ASSISTANT_SPEAK_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAssistantSpeakEnabled(on) {
  try {
    const ls = storage();
    if (ls) {
      if (on) ls.setItem(ASSISTANT_SPEAK_KEY, "1");
      else ls.removeItem(ASSISTANT_SPEAK_KEY);
    }
  } catch {
    /* ignore */
  }
  notify();
  return !!on;
}

export function getAssistantVoiceId() {
  try {
    const ls = storage();
    if (!ls) return "auto";
    const v = ls.getItem(ASSISTANT_VOICE_KEY);
    if (v && ASSISTANT_VOICE_PRESETS.some((p) => p.id === v)) return v;
  } catch {
    /* ignore */
  }
  return "auto";
}

export function setAssistantVoiceId(id) {
  const next = ASSISTANT_VOICE_PRESETS.some((p) => p.id === id) ? id : "auto";
  try {
    const ls = storage();
    if (ls) {
      if (next === "auto") ls.removeItem(ASSISTANT_VOICE_KEY);
      else ls.setItem(ASSISTANT_VOICE_KEY, next);
    }
  } catch {
    /* ignore */
  }
  notify();
  return next;
}

/**
 * Global sell fees for Service Upgrade estimate generator.
 * Device cache + cloud (settings profile.estimateGeneratorFees) so phone ↔ computer stay linked.
 */
export const ESTIMATE_GENERATOR_FEES_KEY = "lepro_estimate_generator_fees";

export function getEstimateGeneratorFees() {
  try {
    const ls = storage();
    if (!ls) return {};
    const raw = ls.getItem(ESTIMATE_GENERATOR_FEES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** Deep-merge two fee objects one level for nested tables (meter, panel, …). */
export function mergeEstimateGeneratorFees(base, partial) {
  const prev = base && typeof base === "object" ? base : {};
  const patch = partial && typeof partial === "object" ? partial : {};
  const next = { ...prev, ...patch };
  for (const key of Object.keys(patch)) {
    const p = patch[key];
    if (p && typeof p === "object" && !Array.isArray(p) && prev[key] && typeof prev[key] === "object") {
      next[key] = { ...prev[key], ...p };
    }
  }
  return next;
}

/** Deep-merge partial fee overrides into stored estimate-generator fees (local cache). */
export function setEstimateGeneratorFees(partial) {
  try {
    const ls = storage();
    if (!ls) return getEstimateGeneratorFees();
    const next = mergeEstimateGeneratorFees(getEstimateGeneratorFees(), partial);
    ls.setItem(ESTIMATE_GENERATOR_FEES_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  notify();
  return getEstimateGeneratorFees();
}

/**
 * Replace local estimate-generator fees from cloud settings (phone ↔ computer link).
 * Empty/missing cloud leaves the device cache alone so a first-time blank server
 * never wipes prices you already set on this device.
 */
export function hydrateEstimateGeneratorFeesFromCloud(cloudFees) {
  if (!cloudFees || typeof cloudFees !== "object" || Array.isArray(cloudFees)) {
    return getEstimateGeneratorFees();
  }
  if (!Object.keys(cloudFees).length) return getEstimateGeneratorFees();
  try {
    const ls = storage();
    if (!ls) return getEstimateGeneratorFees();
    // Cloud wins when present — last save from either device is the source of truth.
    ls.setItem(ESTIMATE_GENERATOR_FEES_KEY, JSON.stringify(cloudFees));
  } catch {
    /* ignore */
  }
  notify();
  return getEstimateGeneratorFees();
}

/**
 * Checkmaker — saved funding accounts a check can be drawn from.
 * Device cache + cloud (settings profile.checkmakerAccounts) so phone ↔ computer stay linked.
 * Each account: { id, label, name, addr1, addr2, phone, bank, account, routing, fractional, startCheckNo }.
 */
export const CHECKMAKER_ACCOUNTS_KEY = "lepro_checkmaker_accounts";

/** Seed preset: BLZ Electric's own Chase account (prints on every check they issue). */
export function defaultCheckmakerAccounts() {
  return [
    {
      id: "blz-chase",
      label: "BLZ Electric — Chase",
      name: "BLZ Electric Inc.",
      addr1: "1243 E 15th Street",
      addr2: "Brooklyn, NY 11230",
      phone: "(718) 594-1850",
      bank: "JPMorgan Chase Bank, N.A.",
      account: "606031220",
      routing: "021000021",
      fractional: "1-12/210",
      startCheckNo: "1001",
    },
  ];
}

export function getCheckmakerAccounts() {
  try {
    const ls = storage();
    if (!ls) return defaultCheckmakerAccounts();
    const raw = ls.getItem(CHECKMAKER_ACCOUNTS_KEY);
    if (!raw) return defaultCheckmakerAccounts();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : defaultCheckmakerAccounts();
  } catch {
    return defaultCheckmakerAccounts();
  }
}

export function setCheckmakerAccounts(list) {
  try {
    const ls = storage();
    if (!ls) return getCheckmakerAccounts();
    ls.setItem(CHECKMAKER_ACCOUNTS_KEY, JSON.stringify(Array.isArray(list) ? list : []));
  } catch {
    /* ignore */
  }
  notify();
  return getCheckmakerAccounts();
}

/** Replace local checkmaker accounts from cloud settings (phone ↔ computer link). */
export function hydrateCheckmakerAccountsFromCloud(cloudList) {
  if (!Array.isArray(cloudList) || !cloudList.length) return getCheckmakerAccounts();
  try {
    const ls = storage();
    if (!ls) return getCheckmakerAccounts();
    ls.setItem(CHECKMAKER_ACCOUNTS_KEY, JSON.stringify(cloudList));
  } catch {
    /* ignore */
  }
  notify();
  return getCheckmakerAccounts();
}

export function readAppSettings() {
  return {
    speechToText: isSpeechToTextEnabled(),
    quickbooks: isQuickbooksFeatureEnabled(),
    quickbooksDocs: isQuickbooksDocsFeatureEnabled(),
    quickbooksInvoices: isQuickbooksDocFeatureEnabled("invoice"),
    quickbooksEstimates: isQuickbooksDocFeatureEnabled("estimate"),
    logoSrc: getCompanyLogoSrc(),
    logoCustom: !!getCompanyLogoDataUrl(),
    chatPanelSize: getChatPanelSize(),
    assistantSpeak: isAssistantSpeakEnabled(),
    assistantVoice: getAssistantVoiceId(),
    estimateGeneratorFees: getEstimateGeneratorFees(),
    checkmakerAccounts: getCheckmakerAccounts(),
  };
}

/** React hook — re-renders when speech or logo settings change. */
export function useAppSettings() {
  const [settings, setSettings] = useState(readAppSettings);
  useEffect(() => {
    const refresh = () => setSettings(readAppSettings());
    window.addEventListener(SETTINGS_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(SETTINGS_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return settings;
}
