// Pick an existing job to link to a calendar appointment.
import React from "react";
import Sheet, { Opt } from "./Sheet.jsx";
import { useStore } from "../state/store.jsx";
import { fmtAmountDue } from "../lib/customers.js";
import { evStart, fmt$ } from "../lib/format.js";
import { sortJobs } from "../lib/stages.js";
import { withJobLink } from "../lib/calendarLink.js";

export default function LinkJobSheet({ event, onClose, onLinked }) {
  const { jobs, patchAndSave, enqueue, showToast } = useStore();
  const open = sortJobs(jobs.filter((j) => !j._archived && !j._deleted), "customer");

  const link = async (job) => {
    const desc = withJobLink(event.description, job.id);
    await patchAndSave(job.id, { calEventId: event.id || job.calEventId || "" });
    if (event.id) {
      await enqueue(
        "calendar_upsert",
        job.id,
        {
          calEventId: event.id,
          summary: event.summary || "Appointment",
          start: evStart(event),
          location: event.location || "",
          description: desc || "Linked from LE Pro",
        },
        "judgment",
        "callink:" + event.id + ":" + job.id
      );
    }
    showToast("Linked to " + (job.customer || "job"));
    onLinked && onLinked(job);
    onClose();
  };

  return (
    <Sheet title="Link to existing job" onClose={onClose}>
      <p className="text-sm text-slate-500 mb-3">Pick the job this appointment belongs to.</p>
      {open.length ? (
        open.map((j) => (
          <Opt
            key={j.id}
            icon="🔗"
            title={j.customer || j.businessName || "—"}
            note={[j.title, fmtAmountDue(j) || fmt$(j.amount)].filter(Boolean).join(" · ")}
            onClick={() => link(j)}
          />
        ))
      ) : (
        <div className="text-sm text-slate-400 text-center py-6">No open jobs.</div>
      )}
    </Sheet>
  );
}