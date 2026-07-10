// Mood-based customer email from an appointment follow-up.
import React, { useMemo, useState } from "react";
import Sheet, { Fld } from "./Sheet.jsx";
import { useStore } from "../state/store.jsx";
import { todayStr } from "../lib/format.js";
import { EMAIL_MOODS, generateFollowUpEmail } from "../lib/appointmentActions.js";

export default function AppointmentEmailSheet({ job, emailKind, title, onClose }) {
  const { enqueue, logSend, showToast } = useStore();
  const [mood, setMood] = useState(null);
  const [msg, setMsg] = useState("");

  const pickMood = (key) => {
    setMood(key);
    setMsg(generateFollowUpEmail(job, emailKind, key));
  };

  const moodLabel = useMemo(() => EMAIL_MOODS.find((m) => m.key === mood)?.label || "", [mood]);

  const send = () => {
    if (!msg.trim()) return showToast("Write a message first");
    enqueue(
      "send_reminder",
      job.id,
      {
        email: job.email || "",
        invoiceNo: job.invoiceNo || "",
        estimateNo: job.estimateNo || "",
        message: msg,
        mood: mood || "friendly",
      },
      "judgment",
      "appt-email:" + job.id + ":" + (emailKind || "est") + ":" + todayStr()
    );
    logSend(job.id, "Appointment follow-up email queued" + (moodLabel ? " (" + moodLabel + ")" : ""));
    showToast("Email queued — watch Activity");
    onClose();
  };

  return (
    <Sheet title={title || "Email customer"} onClose={onClose}>
      <p className="text-sm text-slate-500 mb-3">Pick a tone — I'll draft the email. Edit it if you want, then send.</p>
      <div className="grid grid-cols-2 gap-2 mb-4" data-testid="email-mood-grid">
        {EMAIL_MOODS.map((m) => (
          <button
            key={m.key}
            type="button"
            className={
              "btn text-left !py-2.5 !px-3 text-sm " +
              (mood === m.key ? "bg-brand-soft text-brand ring-2 ring-brand/30" : "bg-slate-100 text-slate-800")
            }
            onClick={() => pickMood(m.key)}
            data-testid={"mood-" + m.key}
          >
            <span className="mr-1">{m.emoji}</span> {m.label}
          </button>
        ))}
      </div>
      {mood ? (
        <>
          <Fld label={"Message — " + moodLabel}>
            <textarea
              className="input min-h-[120px]"
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              aria-label="Email message"
            />
          </Fld>
          <button type="button" className="btn-brand w-full" onClick={send} data-testid="send-appt-email">
            ✉️ Send via Dispatch
          </button>
          <p className="text-[11px] text-slate-400 text-center mt-2">Goes to Dispatch for review/send.</p>
        </>
      ) : (
        <p className="text-sm text-slate-400 text-center py-4">Choose a mood above to generate the email.</p>
      )}
    </Sheet>
  );
}