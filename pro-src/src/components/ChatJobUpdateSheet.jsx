// Compact job edit sheet opened from the Dispatch bubble.
import React, { useState } from "react";
import { useStore } from "../state/store.jsx";
import Sheet, { Fld } from "./Sheet.jsx";

export default function ChatJobUpdateSheet({ job, onClose }) {
  const { patchJob, showToast } = useStore();
  const [notes, setNotes] = useState(job.notes || "");
  const [followUp, setFollowUp] = useState((job.followUp && job.followUp.text) || "");
  const [phone, setPhone] = useState(job.phone || "");
  const [email, setEmail] = useState(job.email || "");

  const save = () => {
    const patch = {};
    if (notes !== (job.notes || "")) patch.notes = notes;
    if (followUp !== ((job.followUp && job.followUp.text) || ""))
      patch.followUp = { text: followUp, date: (job.followUp && job.followUp.date) || "" };
    if (phone !== (job.phone || "")) patch.phone = phone;
    if (email !== (job.email || "")) patch.email = email;
    if (!Object.keys(patch).length) return showToast("No changes");
    patchJob(job.id, patch);
    showToast("Job updated — tap Save when ready");
    onClose();
  };

  return (
    <Sheet title="Update job" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-slate-500">
          {job.customer || "Job"} — {job.title || "untitled"}
        </p>
        <Fld label="Notes">
          <textarea className="input min-h-[72px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Fld>
        <Fld label="Follow-up">
          <input className="input" value={followUp} onChange={(e) => setFollowUp(e.target.value)} placeholder="Call back, send estimate…" />
        </Fld>
        <Fld label="Phone">
          <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Fld>
        <Fld label="Email">
          <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Fld>
        <button type="button" className="btn w-full" onClick={save}>
          Stage changes
        </button>
      </div>
    </Sheet>
  );
}