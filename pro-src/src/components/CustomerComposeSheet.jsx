// In-app email / text compose — write, polish (mood), send without leaving the app.
import React, { useMemo, useState } from "react";
import Sheet, { Fld } from "./Sheet.jsx";
import { useStore } from "../state/store.jsx";
import { todayStr } from "../lib/format.js";
import {
  EMAIL_MOODS,
  defaultComposeDraft,
  defaultEmailSubject,
  generateCustomerMessage,
} from "../lib/customerCompose.js";

export default function CustomerComposeSheet({
  job,
  channel = "email",
  context = "general",
  title,
  initialTo,
  initialPhone,
  initialSubject,
  initialMessage,
  paymentUrl,
  onClose,
  extraActions,
}) {
  const { enqueue, logSend, showToast } = useStore();
  const isEmail = channel === "email";
  const [to, setTo] = useState(initialTo || job?.email || "");
  const [phone, setPhone] = useState(initialPhone || job?.phone || "");
  const [subject, setSubject] = useState(
    initialSubject || (isEmail ? defaultEmailSubject(job, context) : "")
  );
  const [msg, setMsg] = useState(
    initialMessage || defaultComposeDraft(job, { channel, context, url: paymentUrl })
  );
  const [moodOpen, setMoodOpen] = useState(false);
  const [lastMood, setLastMood] = useState(null);

  const moodLabel = useMemo(() => EMAIL_MOODS.find((m) => m.key === lastMood)?.label || "", [lastMood]);

  const polish = (key) => {
    setLastMood(key);
    setMsg(
      generateCustomerMessage(job, {
        channel,
        context: context === "payment" && initialMessage ? "custom" : context,
        mood: key,
        url: paymentUrl,
        subject,
        body: initialMessage || msg,
      })
    );
    setMoodOpen(false);
  };

  const send = () => {
    const message = msg.trim();
    if (!message) return showToast("Write a message first");
    if (isEmail) {
      const email = (to || "").trim();
      if (!email) return showToast("Enter an email address");
      enqueue(
        "send_customer_email",
        job?.id || "customer",
        {
          email,
          subject: (subject || "").trim() || defaultEmailSubject(job, context),
          message,
          mood: lastMood || "friendly",
          customer: job?.customer || "",
          invoiceNo: job?.invoiceNo || "",
          estimateNo: job?.estimateNo || "",
        },
        "deterministic",
        "cust-email:" + (job?.id || "x") + ":" + todayStr() + ":" + Date.now()
      );
      if (job?.id) logSend(job.id, "Email sent" + (moodLabel ? " (" + moodLabel + ")" : ""), email);
      showToast("Email sent");
    } else {
      const num = (phone || "").trim();
      if (!num) return showToast("Enter a phone number");
      enqueue(
        "send_sms",
        job?.id || "customer",
        {
          phone: num,
          message,
          mood: lastMood || "friendly",
          customer: job?.customer || "",
          invoiceNo: job?.invoiceNo || "",
        },
        "judgment",
        "cust-sms:" + (job?.id || "x") + ":" + todayStr() + ":" + Date.now()
      );
      if (job?.id) logSend(job.id, "Text queued" + (moodLabel ? " (" + moodLabel + ")" : ""), num);
      showToast("Text queued — watch Activity");
    }
    onClose();
  };

  const sheetTitle =
    title || (isEmail ? "Email " + (job?.customer || "customer") : "Text " + (job?.customer || "customer"));

  return (
    <Sheet title={sheetTitle} onClose={onClose}>
      <p className="text-sm text-slate-500 mb-3">
        {isEmail
          ? "Write your message, polish the tone if you want, then send — stays in the app."
          : "Write your text, polish the tone, then send from here."}
      </p>

      {isEmail ? (
        <Fld label="To">
          <input
            type="email"
            className="input"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder={job?.email || "customer@email.com"}
            aria-label="Email recipient"
            data-testid="compose-email-to"
          />
        </Fld>
      ) : (
        <Fld label="To">
          <input
            type="tel"
            className="input"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={job?.phone || "phone number"}
            aria-label="Text recipient"
            data-testid="compose-sms-to"
          />
        </Fld>
      )}

      {isEmail ? (
        <Fld label="Subject">
          <input
            className="input"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            aria-label="Email subject"
            data-testid="compose-email-subject"
          />
        </Fld>
      ) : null}

      <Fld label="Message">
        <textarea
          className="input min-h-[120px]"
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          aria-label="Message"
          data-testid="compose-message"
        />
      </Fld>

      <div className="relative mb-3">
        <button
          type="button"
          className="btn w-full !py-2 bg-slate-100 text-slate-800"
          onClick={() => setMoodOpen((v) => !v)}
          data-testid="compose-polish-btn"
        >
          ✨ Polish{moodLabel ? " — " + moodLabel : ""}
        </button>
        {moodOpen ? (
          <div
            className="absolute left-0 right-0 top-full mt-1 z-10 grid grid-cols-2 gap-1.5 p-2 bg-white border border-slate-200 rounded-2xl shadow-lg"
            data-testid="compose-mood-menu"
          >
            {EMAIL_MOODS.map((m) => (
              <button
                key={m.key}
                type="button"
                className={
                  "btn text-left !py-2 !px-2.5 text-xs " +
                  (lastMood === m.key ? "bg-brand-soft text-brand ring-2 ring-brand/30" : "bg-slate-50 text-slate-800")
                }
                onClick={() => polish(m.key)}
                data-testid={"compose-mood-" + m.key}
              >
                <span className="mr-0.5">{m.emoji}</span> {m.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <button type="button" className="btn-brand w-full" onClick={send} data-testid="compose-send-btn">
        {isEmail ? "✉️ Send email" : "💬 Send text"}
      </button>

      {extraActions ? <div className="mt-2 space-y-2">{extraActions}</div> : null}

      <p className="text-[11px] text-slate-400 text-center mt-2">
        {isEmail ? "Sends from office@leelectrical.us — shows in Activity." : "Goes to Dispatch to send — status in Activity."}
      </p>
    </Sheet>
  );
}