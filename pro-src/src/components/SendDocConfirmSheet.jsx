// Pre-send confirmation — recipient, subject, body, attachment, pay link. Explicit Approve required.
import React, { useEffect, useState } from "react";
import Sheet, { Fld } from "./Sheet.jsx";
import {
  buildSendDocConfirm,
  canApproveSendConfirm,
  defaultDocEmailBody,
  defaultDocEmailSubject,
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
          onChange={(e) => setEmail(e.target.value)}
          aria-label="Recipient email"
          data-testid="send-confirm-email"
        />
      </Fld>

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
