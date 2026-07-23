// App preferences — speech-to-text + company logo + QuickBooks feature (local device).
import { useEffect, useState } from "react";

export const SPEECH_TO_TEXT_KEY = "lepro_speech_to_text";
export const COMPANY_LOGO_KEY = "lepro_company_logo";
export const QUICKBOOKS_FEATURE_KEY = "lepro_feature_quickbooks";
export const SETTINGS_EVENT = "lepro-settings";

const DEFAULT_LOGO = () =>
  typeof import.meta !== "undefined" && import.meta.env?.BASE_URL
    ? import.meta.env.BASE_URL + "le-logo.png?v=6"
    : "/app/pro/le-logo.png?v=6";

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

/** Custom logo data URL, or empty string when using the built-in logo. */
export function getCompanyLogoDataUrl() {
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

export function setCompanyLogoDataUrl(dataUrl) {
  const ls = storage();
  if (!ls) return;
  try {
    if (dataUrl) ls.setItem(COMPANY_LOGO_KEY, dataUrl);
    else ls.removeItem(COMPANY_LOGO_KEY);
  } catch {
    /* ignore */
  }
  notify();
}

export function clearCompanyLogo() {
  setCompanyLogoDataUrl("");
}

/**
 * Read an image file, downscale to max edge, return a JPEG/PNG data URL.
 * Keeps localStorage size reasonable for a company logo.
 */
export function readLogoFileAsDataUrl(file, maxEdge = 512) {
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

export function readAppSettings() {
  return {
    speechToText: isSpeechToTextEnabled(),
    quickbooks: isQuickbooksFeatureEnabled(),
    logoSrc: getCompanyLogoSrc(),
    logoCustom: !!getCompanyLogoDataUrl(),
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
