import React, { useEffect, useRef, useState } from "react";
import { fetchSolaIfieldsConfig, formatCardExpInput } from "../lib/solaCharge.js";
import { productName } from "../lib/tenantBranding.js";

const IFIELD_STYLE = {
  border: "1px solid #cbd5e1",
  "border-radius": "10px",
  "font-size": "16px",
  padding: "8px 10px",
  width: "100%",
  height: "44px",
  outline: "none",
};

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === "1") resolve();
      else existing.addEventListener("load", () => resolve(), { once: true });
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => {
      s.dataset.loaded = "1";
      resolve();
    };
    s.onerror = () => reject(new Error("Could not load card security library"));
    document.head.appendChild(s);
  });
}

const IFRAME_H = 44;

/**
 * Best-effort fill of Cardknox/Sola iFields (card-number or cvv).
 * SDKs differ by version — try known hooks; never throw if missing (PCI iframes).
 */
function tryFillIfield(fieldId, value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return false;
  if (fieldId === "card-number" && digits.length < 12) return false;
  if (fieldId === "cvv" && (digits.length < 3 || digits.length > 4)) return false;
  const ids = fieldId === "cvv" ? ["cvv", "card-cvv"] : ["card-number"];
  try {
    if (typeof window.setIfieldValue === "function") {
      for (const id of ids) {
        try {
          window.setIfieldValue(id, digits);
          return true;
        } catch {
          /* try next */
        }
      }
    }
  } catch {
    /* ignore */
  }
  try {
    if (typeof window.ifields?.setValue === "function") {
      window.ifields.setValue(fieldId, digits);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

/** PCI-safe card fields via Sola iFields (card number + CVV iframes). */
export default function SolaCardForm({
  disabled,
  onReadyChange,
  savedMasked,
  initialExp = "",
  /** From card photo: { pan?, exp?, cvv?, name? } — fill secure fields only, no stars UI */
  photoAssist = null,
}) {
  const [phase, setPhase] = useState("loading"); // loading | ready | error
  const [err, setErr] = useState("");
  const [exp, setExp] = useState(() => formatCardExpInput(initialExp || ""));
  const configRef = useRef(null);
  const formRef = useRef(null);
  const photoPanRef = useRef("");
  const photoCvvRef = useRef("");

  useEffect(() => {
    if (initialExp) setExp(formatCardExpInput(initialExp));
  }, [initialExp]);

  // Levi 2026-08-05: photo → fill real card # / exp / CVV only (no stars banner).
  useEffect(() => {
    if (!photoAssist) return;
    const pan = String(photoAssist.pan || "").replace(/\D/g, "");
    const cvv = String(photoAssist.cvv || "").replace(/\D/g, "");
    photoPanRef.current = pan;
    photoCvvRef.current = cvv;
    if (photoAssist.exp) setExp(formatCardExpInput(photoAssist.exp));
    if (phase !== "ready") return;
    if (pan.length >= 12) {
      tryFillIfield("card-number", pan);
      setTimeout(() => tryFillIfield("card-number", pan), 200);
      setTimeout(() => {
        photoPanRef.current = "";
      }, 400);
    }
    if (cvv.length >= 3) {
      tryFillIfield("cvv", cvv);
      setTimeout(() => tryFillIfield("cvv", cvv), 200);
      setTimeout(() => {
        photoCvvRef.current = "";
      }, 400);
    }
  }, [photoAssist, phase]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await fetchSolaIfieldsConfig();
        if (cancelled) return;
        configRef.current = cfg;
        const ver = cfg.version || "2.15.2409.2601";
        await loadScript(`https://cdn.cardknox.com/ifields/${ver}/ifields.min.js`);
        if (cancelled) return;
        if (typeof window.setAccount === "function") {
          // Read via the module snapshot, not the hook: setAccount is a
          // one-shot SDK init and must not re-run when config resolves.
          window.setAccount(
            cfg.ifieldsKey,
            cfg.softwareName || productName(),
            cfg.softwareVersion || "1.0.0"
          );
        }
        if (typeof window.setIfieldStyle === "function") {
          window.setIfieldStyle("card-number", IFIELD_STYLE);
          window.setIfieldStyle("cvv", IFIELD_STYLE);
        }
        if (typeof window.enableAutoFormatting === "function") {
          window.enableAutoFormatting(" ");
        }
        setPhase("ready");
        setErr("");
        onReadyChange?.(true);
        // If photo already ran before iframe ready, fill now.
        const pendingPan = photoPanRef.current;
        const pendingCvv = photoCvvRef.current;
        if (pendingPan.length >= 12) {
          tryFillIfield("card-number", pendingPan);
          setTimeout(() => tryFillIfield("card-number", pendingPan), 200);
          photoPanRef.current = "";
        }
        if (pendingCvv.length >= 3) {
          tryFillIfield("cvv", pendingCvv);
          setTimeout(() => tryFillIfield("cvv", pendingCvv), 200);
          photoCvvRef.current = "";
        }
      } catch (e) {
        if (cancelled) return;
        setPhase("error");
        setErr((e && e.message) || "Card fields unavailable");
        onReadyChange?.(false);
      }
    })();
    return () => {
      cancelled = true;
      onReadyChange?.(false);
    };
  }, [onReadyChange]);

  const ver = configRef.current?.version || "2.15.2409.2601";
  const iframeSrc = `https://cdn.cardknox.com/ifields/${ver}/ifield.htm`;

  return (
    <div className="space-y-2.5" data-testid="sola-card-form">
      {savedMasked ? (
        <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
          Card on file: <b>{savedMasked}</b> — enter a new card below to replace it.
        </p>
      ) : null}
      
      {phase === "loading" ? (
        <p className="text-xs text-slate-500">Loading secure card fields…</p>
      ) : null}
      {phase === "error" ? (
        <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{err}</p>
      ) : null}
      {phase === "ready" ? (
        <div className={disabled ? "pointer-events-none opacity-60" : undefined} aria-disabled={disabled || undefined}>
        <form ref={formRef} onSubmit={(e) => e.preventDefault()} className="space-y-2.5">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">Card number</label>
            
            {/* Secure iframe still required for charge; when stars filled, keep it
                available to edit/correct digits after review. */}
            <div
              className="overflow-hidden rounded-xl"
              style={{ height: IFRAME_H }}
              data-testid="sola-ifield-card-number"
            >
              <iframe
                title="Card number"
                data-ifields-id="card-number"
                data-ifields-placeholder="Card number"
                src={iframeSrc}
                scrolling="no"
                className="w-full border-0 block overflow-hidden"
                style={{ height: IFRAME_H, minHeight: IFRAME_H, overflow: "hidden" }}
              />
            </div>
            
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1" htmlFor="card-exp">
                Exp (MM/YY)
              </label>
              <input
                id="card-exp"
                className="input"
                inputMode="numeric"
                autoComplete="cc-exp"
                placeholder="MM/YY"
                maxLength={5}
                value={exp}
                onChange={(e) => setExp(formatCardExpInput(e.target.value))}
                aria-label="Expiration MM/YY"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">CVV</label>
              <div
                className="overflow-hidden rounded-xl"
                style={{ height: IFRAME_H }}
                data-testid="sola-ifield-cvv"
              >
                <iframe
                  title="CVV"
                  data-ifields-id="cvv"
                  data-ifields-placeholder="CVV"
                  src={iframeSrc}
                  scrolling="no"
                  className="w-full border-0 block overflow-hidden"
                  style={{ height: IFRAME_H, minHeight: IFRAME_H, overflow: "hidden" }}
                />
              </div>
            </div>
          </div>
          <input type="hidden" data-ifields-id="card-number-token" name="xCardNum" />
          <input type="hidden" data-ifields-id="cvv-token" name="xCVV" />
          <label data-ifields-id="card-data-error" className="block text-xs text-red-600 min-h-[0.75rem]" />
        </form>
        </div>
      ) : null}
    </div>
  );
}

/** Tokenize card data via iFields; resolves with SUTs for server charge. */
export function tokenizeSolaCard({ timeoutMs = 45000 } = {}) {
  return new Promise((resolve, reject) => {
    if (typeof window.getTokens !== "function") {
      reject(new Error("Card fields not ready yet"));
      return;
    }
    window.getTokens(
      () => {
        const cardNum = document.querySelector('[data-ifields-id="card-number-token"]')?.value || "";
        const cvv = document.querySelector('[data-ifields-id="cvv-token"]')?.value || "";
        const expRaw = document.getElementById("card-exp")?.value || "";
        if (!cardNum) {
          reject(new Error("Enter a valid card number"));
          return;
        }
        resolve({ xCardNum: cardNum, xCVV: cvv, xExp: expRaw });
      },
      () => {
        const msg =
          document.querySelector('[data-ifields-id="card-data-error"]')?.textContent ||
          "Check card number, expiration, and CVV";
        reject(new Error(msg.trim() || "Card validation failed"));
      },
      timeoutMs
    );
  });
}