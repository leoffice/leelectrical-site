import React, { useEffect, useRef, useState } from "react";
import { fetchSolaIfieldsConfig } from "../lib/solaCharge.js";

const IFIELD_STYLE = {
  border: "1px solid #cbd5e1",
  "border-radius": "12px",
  "font-size": "16px",
  padding: "10px 12px",
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

/** PCI-safe card fields via Sola iFields (card number + CVV iframes). */
export default function SolaCardForm({ disabled, onReadyChange }) {
  const [phase, setPhase] = useState("loading"); // loading | ready | error
  const [err, setErr] = useState("");
  const configRef = useRef(null);
  const formRef = useRef(null);

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
          window.setAccount(cfg.ifieldsKey, cfg.softwareName || "LE Pro", cfg.softwareVersion || "1.0.0");
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
    <div className="space-y-3" data-testid="sola-card-form">
      {phase === "loading" ? (
        <p className="text-xs text-slate-500">Loading secure card fields…</p>
      ) : null}
      {phase === "error" ? (
        <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{err}</p>
      ) : null}
      {phase === "ready" ? (
        <form ref={formRef} onSubmit={(e) => e.preventDefault()} className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5">Card number</label>
            <iframe
              title="Card number"
              data-ifields-id="card-number"
              data-ifields-placeholder="Card number"
              src={iframeSrc}
              className="w-full h-11 rounded-xl border-0"
              style={{ minHeight: 44 }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5" htmlFor="card-exp">
                Expiration (MM/YY)
              </label>
              <input
                id="card-exp"
                className="input"
                inputMode="numeric"
                placeholder="MM/YY"
                maxLength={7}
                disabled={disabled}
                aria-label="Expiration MM/YY"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5">CVV</label>
              <iframe
                title="CVV"
                data-ifields-id="cvv"
                data-ifields-placeholder="CVV"
                src={iframeSrc}
                className="w-full h-11 rounded-xl border-0"
                style={{ minHeight: 44 }}
              />
            </div>
          </div>
          <input type="hidden" data-ifields-id="card-number-token" name="xCardNum" />
          <input type="hidden" data-ifields-id="cvv-token" name="xCVV" />
          <label data-ifields-id="card-data-error" className="block text-xs text-red-600 min-h-[1rem]" />
        </form>
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