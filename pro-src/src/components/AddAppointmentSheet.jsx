// Queue a new Google Calendar appointment (calendar_upsert on the command bus).
import React, { useState } from "react";
import Sheet, { Fld } from "./Sheet.jsx";
import { useStore } from "../state/store.jsx";

export default function AddAppointmentSheet({ defaultDate, onClose }) {
  const { enqueue, showToast } = useStore();
  const [summary, setSummary] = useState("");
  const [dt, setDt] = useState(defaultDate ? defaultDate + "T09:00" : "");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");

  const save = async () => {
    const title = (summary || "").trim();
    if (!title) return showToast("Add a title for the appointment");
    if (!dt) return showToast("Pick date and time");
    const key = "todaycal:" + dt + ":" + title.slice(0, 24);
    await enqueue(
      "calendar_upsert",
      "today",
      {
        calEventId: "",
        summary: title,
        start: dt,
        location: location || "",
        description: notes || "Created in LE Pro",
      },
      "judgment",
      key
    );
    showToast("Appointment queued — syncs to Google Calendar");
    onClose();
  };

  return (
    <Sheet title="Add appointment" onClose={onClose}>
      <Fld label="Title" hint="What shows on the calendar">
        <input className="input" value={summary} onChange={(e) => setSummary(e.target.value)} aria-label="Appointment title" />
      </Fld>
      <Fld label="Date & time">
        <input
          className="input"
          type="datetime-local"
          value={dt}
          onChange={(e) => setDt(e.target.value)}
          aria-label="Appointment date and time"
        />
      </Fld>
      <Fld label="Location" hint="Service address (optional)">
        <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} aria-label="Location" />
      </Fld>
      <Fld label="Notes" hint="Phone, customer name, details (optional)">
        <textarea className="input min-h-[60px]" value={notes} onChange={(e) => setNotes(e.target.value)} aria-label="Notes" />
      </Fld>
      <button className="btn-brand w-full" onClick={save}>
        Add to calendar
      </button>
      <p className="text-[11px] text-slate-400 text-center mt-2">
        Writes to office@leelectrical.us via Sync. Pull calendar again to see it here.
      </p>
    </Sheet>
  );
}