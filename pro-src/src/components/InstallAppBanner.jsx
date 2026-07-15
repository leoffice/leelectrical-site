import React, { useEffect, useState } from "react";
import {
  dismissInstallPrompt,
  dismissShortcutWarn,
  isAndroid,
  isIosSafari,
  isStandalone,
  shouldOfferInstall,
  shouldWarnShortcut,
} from "../lib/pwaInstall.js";

export default function InstallAppBanner() {
  const [visible, setVisible] = useState(false);
  const [deferred, setDeferred] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (shouldWarnShortcut() || shouldOfferInstall()) setVisible(true);

    const onPrompt = (e) => {
      e.preventDefault();
      setDeferred(e);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const close = () => {
    if (shouldWarnShortcut()) dismissShortcutWarn();
    else dismissInstallPrompt();
    setVisible(false);
  };

  const install = async () => {
    if (!deferred) return;
    setBusy(true);
    try {
      await deferred.prompt();
      await deferred.userChoice;
    } catch {
      /* user cancelled or browser blocked */
    } finally {
      setBusy(false);
      setDeferred(null);
      if (isStandalone()) close();
    }
  };

  if (!visible) return null;

  const ios = isIosSafari();
  const android = isAndroid();
  const shortcut = shouldWarnShortcut();

  return (
    <div
      className="fixed left-4 right-4 z-[65] bottom-[4.75rem] lg:bottom-6 lg:left-auto lg:right-6 lg:max-w-sm"
      data-testid="install-app-banner"
    >
      <div className={`card shadow-xl px-4 py-3.5 ${shortcut ? "border-amber-300 bg-amber-50" : "border-brand/30 bg-white"}`}>
        <div className="flex items-start gap-3">
          <span className="text-2xl leading-none shrink-0" aria-hidden>
            {shortcut ? "⚠️" : "📲"}
          </span>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-slate-900 text-sm">
              {shortcut ? "This is a browser shortcut — not the real app" : "Install LE Pro on your phone"}
            </div>
            {shortcut ? (
              <p className="text-xs text-slate-700 mt-1 leading-relaxed">
                Long-press the home-screen icon and <b>Remove</b>. Open{" "}
                <b>www.leelectrical.us/app/pro</b> in Chrome, then tap <b>Install app</b> — LE Pro opens
                full-screen with just your logo, like a native app.
              </p>
            ) : ios ? (
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Open this page in <b>Safari</b>, tap <b>Share</b> (↑), then <b>Add to Home Screen</b>. That
                installs the real app — not a browser bookmark.
              </p>
            ) : android && deferred ? (
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Tap Install — LE Pro opens full-screen from your home screen like a native app.
              </p>
            ) : android ? (
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                In Chrome, tap the <b>⋮</b> menu, then <b>Install app</b> or <b>Add to Home screen</b>.
              </p>
            ) : (
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Use your browser&apos;s install or Add to Home Screen option for the full-screen app.
              </p>
            )}
            <div className="flex flex-wrap gap-2 mt-3">
              {android && deferred ? (
                <button
                  type="button"
                  className="btn bg-brand text-white !py-1.5 !px-3 text-xs"
                  onClick={install}
                  disabled={busy}
                  data-testid="install-app-btn"
                >
                  {busy ? "Installing…" : "Install LE Pro"}
                </button>
              ) : null}
              <button
                type="button"
                className="btn bg-slate-100 text-slate-700 !py-1.5 !px-3 text-xs"
                onClick={close}
                data-testid="install-app-dismiss"
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}