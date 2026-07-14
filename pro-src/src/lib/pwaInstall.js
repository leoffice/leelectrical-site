const DISMISS_KEY = "le-pro-install-dismissed";

function mediaMatches(query) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia(query).matches;
  } catch {
    return false;
  }
}

/** True when LE Pro is already opened from the home-screen app icon. */
export function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    mediaMatches("(display-mode: standalone)") ||
    mediaMatches("(display-mode: fullscreen)") ||
    window.navigator?.standalone === true
  );
}

/** iPhone/iPad Safari — Add to Home Screen is the install path. */
export function isIosSafari() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const ios =
    /iphone|ipad|ipod/i.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const webkit = /webkit/i.test(ua);
  const inAppBrowser = /crios|fxios|edgios|gsa|fbav|instagram/i.test(ua);
  return ios && webkit && !inAppBrowser;
}

export function isAndroid() {
  return typeof navigator !== "undefined" && /android/i.test(navigator.userAgent || "");
}

export function wasInstallDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissInstallPrompt() {
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function shouldOfferInstall() {
  if (typeof window === "undefined") return false;
  if (isStandalone()) return false;
  if (wasInstallDismissed()) return false;
  return isIosSafari() || isAndroid();
}