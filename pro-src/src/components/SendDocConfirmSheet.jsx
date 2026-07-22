// Pre-send confirmation — recipient, subject, body, attachment, pay link. Explicit Approve required.
// When the typed email differs from the customer: Keep this email | Use it once.
import React, { useEffect, useState } from "react";
import Sheet, { Fld } from "./Sheet.jsx";
import {
  buildSendDocConfirm,
  canApproveSendConfirm,
  defaultDocEmailBody,
  defaultDocEmailSubject,
  EMAIL_POLICY_KEEP,
  EMAIL_POLICY_ONCE,
} from "../lib/sendDocConfirm.js";
import { DOC_SOURCE_LOCAL } from "../lib/docSource.js";

export default function SendDocConfirmSheet({
  job,
  kind = "invoice",
  docSource = DOC_SOURCE_LOCAL,
  withPay = false,
  payUrl = "",
  initialEmail,
  onBack,
  onApprove,
  busy = false,
  error = "",
}) {
  const seed = buildSendDocConfirm({
    job,
    kind,
    docSource,
    withPay,
    email: initialEmail || job?.email,
    payUrl,
  });
  const [email, setEmail] = useState(seed.email);
  const [subject, setSubject] = useState(seed.subject);
  const [message, setMessage] = useState(seed.message);
  const [emailPolicy, setEmailPolicy] = useState(seed.emailPolicy || "");

  useEffect(() => {
    const next = buildSendDocConfirm({
      job,
      kind,
      docSource,
      withPay,
      email: initialEmail || job?.email,
      payUrl,
    });
    setEmail(next.email);
    setSubject(next.subject);
    setMessage(next.message);
    setEmailPolicy(next.emailPolicy || "");
  }, [job?.id, kind, docSource, withPay, payUrl, initialEmail]); // eslint-disable-line react-hooks/exhaustive-deps

  const model = buildSendDocConfirm({
    job,
    kind,
    docSource,
    withPay,
    email,
    subject,
    message,
    payUrl,
    emailPolicy,
  });
  const ok = canApproveSendConfirm(model);
  const label = kind === "estimate" ? "estimate" : "invoice";

  return (
    <Sheet title={"Confirm send " + label} onClose={onBack} tall>
      <p className="text-sm text-slate-500 mb-3" data-testid="send-confirm-intro">
        Review everything below, then Approve. Nothing goes out until you tap Approve.
      </p>

      <Fld label="To (recipient)">
        <input
          className="input"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setEmailPolicy("");
          }}
          aria-label="Recipient email"
          data-testid="send-confirm-email"
        />
      </Fld>

      {model.emailDiffers ? (
        <div
          className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 mb-3"
          data-testid="send-email-policy"
          role="group"
          aria-label="Save this email on the customer?"
        >
          <p className="text-sm font-semibold text-amber-900 mb-2">
            This email is different from the customer&apos;s saved address. What should we do?
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              className={`btn !py-2.5 text-sm text-left ${
                emailPolicy === EMAIL_POLICY_KEEP
                  ? "bg-brand text-white"
                  : "bg-white text-slate-800 border border-amber-200"
              }`}
              onClick={() => setEmailPolicy(EMAIL_POLICY_KEEP)}
              data-testid="send-email-keep"
            >
              <span className="font-extrabold block">Keep this email</span>
              <span className="text-[11px] opacity-90 font-semibold">Update customer information</span>
            </button>
            <button
              type="button"
              className={`btn !py-2.5 text-sm text-left ${
                emailPolicy === EMAIL_POLICY_ONCE
                  ? "bg-brand text-white"
                  : "bg-white text-slate-800 border border-amber-200"
              }`}
              onClick={() => setEmailPolicy(EMAIL_POLICY_ONCE)}
              data-testid="send-email-once"
            >
              <span className="font-extrabold block">Use it once</span>
              <span className="text-[11px] opacity-90 font-semibold">Don&apos;t change the customer</span>
            </button>
          </div>
        </div>
      ) : null}

      <Fld label="Subject">
        <input
          className="input"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          aria-label="Email subject"
          data-testid="send-confirm-subject"
          placeholder={defaultDocEmailSubject(job, kind, { withPay })}
        />
      </Fld>

      <Fld label="Message">
        <textarea
          className="input min-h-[140px] text-sm"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          aria-label="Email message"
          data-testid="send-confirm-message"
          placeholder={defaultDocEmailBody(job, kind, { withPay, payUrl })}
        />
      </Fld>

      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 mb-3 text-sm space-y-1.5" data-testid="send-confirm-meta">
        <div>
          <span className="font-semibold text-slate-700">Attachment: </span>
          <span className="text-slate-600">{model.attachmentName}</span>
        </div>
        <div>
          <span className="font-semibold text-slate-700">File source: </span>
          <span className="text-slate-600">{model.sourceLabel}</span>
        </div>
        {model.withPay ? (
          <div data-testid="send-confirm-pay">
            <span className="font-semibold text-slate-700">Payment link: </span>
            <span className="text-slate-600 break-all">
              {model.payUrl || "Included with this email"}
            </span>
          </div>
        ) : null}
      </div>

      {error ? (
        <div
          className="border border-red-200 bg-red-50 text-red-800 rounded-xl px-3 py-2.5 text-sm mb-3"
          data-testid="send-confirm-error"
          role="alert"
        >
          <b>Send failed — not sent.</b> {error}
        </div>
      ) : null}

      <button
        type="button"
        className="btn-brand w-full mb-2"
        disabled={!ok || busy}
        onClick={() => onApprove?.(model)}
        data-testid="send-confirm-approve"
      >
        {busy ? "Sending…" : "✓ Approve & send"}
      </button>
      <button type="button" className="btn-ghost w-full" onClick={onBack} disabled={busy} data-testid="send-confirm-back">
        Back
      </button>
    </Sheet>
  );
}
