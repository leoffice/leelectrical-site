// Isolated Sync & Email overlay — owns its own input state so typing the
// recipient does not re-render the heavy invoice/estimate builder (line rows).
import React, { useState } from "react";
import { Fld } from "./Sheet.jsx";
import {
  EMAIL_POLICY_KEEP,
  EMAIL_POLICY_ONCE,
  sendEmailDiffersFromCustomer,
} from "../lib/sendDocConfirm.js";
import { DOC_SOURCE_LOCAL, DOC_SOURCE_QBO } from "../lib/docSource.js";

export default function DocEmailComposeSheet({
  kind = "invoice",
  jobEmail = "",
  initialEmail = "",
  initialMessage = "",
  initialIncludePayLink = false,
  qboOn = false,
  saving = false,
  onClose,
  onSend,
}) {
  const [email, setEmail] = useState(initialEmail || jobEmail || "");
  const [message, setMessage] = useState(initialMessage || "");
  const [emailPolicy, setEmailPolicy] = useState("");
  const [includePayLink, setIncludePayLink] = useState(!!initialIncludePayLink);

  const differs = sendEmailDiffersFromCustomer(email, jobEmail);
  const emailNeedsPolicy =
    differs && emailPolicy !== EMAIL_POLICY_KEEP && emailPolicy !== EMAIL_POLICY_ONCE;

  const sendOpts = () => ({
    email,
    message,
    includePaymentLink: includePayLink,
    emailPolicy: emailPolicy || (differs ? "" : EMAIL_POLICY_ONCE),
  });

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/40 p-3"
      data-testid="doc-email-sheet"
      role="dialog"
      aria-label="Sync and email"
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-extrabold text-slate-900">Sync &amp; Email</h3>
          <button
            type="button"
            className="text-slate-400 text-xl leading-none px-2"
            onClick={onClose}
            aria-label="Close"
            disabled={saving}
          >
            ×
          </button>
        </div>
        <Fld label="Send to" hint="Separate multiple emails with a comma">
          <input
            className="input"
            type="text"
            inputMode="email"
            autoComplete="email"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setEmailPolicy("");
            }}
            placeholder="customer@email.com"
            aria-label="Email recipients"
            data-testid="doc-send-emails"
          />
        </Fld>
        {differs ? (
          <div
            className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 mb-3"
            data-testid="doc-email-policy"
          >
            <p className="text-sm font-semibold text-amber-900 mb-2">
              Different from the customer&apos;s saved email. Keep it or use once?
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className={`btn !py-2 text-sm ${
                  emailPolicy === EMAIL_POLICY_KEEP
                    ? "bg-brand text-white"
                    : "bg-white border border-amber-200 text-slate-800"
                }`}
                onClick={() => setEmailPolicy(EMAIL_POLICY_KEEP)}
                data-testid="doc-email-keep"
              >
                Keep this email
              </button>
              <button
                type="button"
                className={`btn !py-2 text-sm ${
                  emailPolicy === EMAIL_POLICY_ONCE
                    ? "bg-brand text-white"
                    : "bg-white border border-amber-200 text-slate-800"
                }`}
                onClick={() => setEmailPolicy(EMAIL_POLICY_ONCE)}
                data-testid="doc-email-once"
              >
                Use it once
              </button>
            </div>
          </div>
        ) : null}
        <Fld label="Message">
          <textarea
            className="input min-h-[100px]"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            aria-label="Email message"
            data-testid="doc-send-message"
          />
        </Fld>
        {kind === "invoice" ? (
          <label className="flex items-center gap-2 mb-3 cursor-pointer" data-testid="doc-pay-link-toggle">
            <input
              type="checkbox"
              checked={includePayLink}
              onChange={(e) => setIncludePayLink(e.target.checked)}
            />
            <span className="text-sm font-semibold text-slate-800">For credit card payment</span>
          </label>
        ) : null}
        {!qboOn ? (
          <button
            type="button"
            className="btn-brand w-full !py-2.5 text-sm"
            disabled={saving || emailNeedsPolicy}
            onClick={() => onSend?.({ ...sendOpts(), docSource: DOC_SOURCE_LOCAL })}
            data-testid="doc-send-local"
          >
            {saving ? "Sending…" : "Send locally"}
          </button>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className="btn-brand !py-2.5 text-sm"
              disabled={saving || emailNeedsPolicy}
              onClick={() => onSend?.({ ...sendOpts(), docSource: DOC_SOURCE_QBO })}
              data-testid="doc-save-sync-send"
            >
              {saving ? "…" : "Send through QB"}
            </button>
            <button
              type="button"
              className="btn !py-2.5 text-sm bg-brand-soft text-brand"
              disabled={saving || emailNeedsPolicy}
              onClick={() => onSend?.({ ...sendOpts(), docSource: DOC_SOURCE_LOCAL })}
              data-testid="doc-send-local"
            >
              {saving ? "…" : "Send locally"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
