// Searchable calendar picker — shared by new-job flow and appointment linking.
import React, { useMemo, useState } from "react";
import Sheet, { Opt } from "./Sheet.jsx";
import { evStart } from "../lib/format.js";
import { displayEventNotes, searchCalendarEvents } from "../lib/calendarLink.js";

function formatWhen(event) {
  return evStart(event).replace("T", " ").slice(0, 16) || "—";
}

export default function CalendarSearchSheet({ events, title, hint, onPick, onClose }) {
  const [query, setQuery] = useState("");
  const matches = useMemo(() => searchCalendarEvents(events, query), [events, query]);

  return (
    <Sheet title={title || "Choose from calendar"} onClose={onClose} wide>
      <p className="text-sm text-slate-500 mb-3">
        {hint || "Appointments this year through next year — search by address, customer, notes, or date."}
      </p>
      <input
        className="input mb-3"
        placeholder="Search address, name, notes…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search calendar appointments"
        data-testid="cal-search-input"
        autoFocus
      />
      {matches.length ? (
        <div className="space-y-0">
          {matches.map((e) => {
            const note = [
              formatWhen(e),
              e.location || "",
              displayEventNotes(e.description).slice(0, 60),
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <Opt
                key={e.id || evStart(e) + e.summary}
                icon="📅"
                title={e.summary || "Appointment"}
                note={note}
                onClick={() => onPick(e)}
              />
            );
          })}
        </div>
      ) : (
        <div className="text-sm text-slate-400 text-center py-8" data-testid="cal-search-empty">
          {query ? "No appointments match your search." : "No calendar events yet — sync calendar first."}
        </div>
      )}
    </Sheet>
  );
}