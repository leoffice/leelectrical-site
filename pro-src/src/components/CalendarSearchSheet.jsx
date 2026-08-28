// Searchable calendar picker — shared by new-job flow and appointment linking.
// Paged: never mount a full-year event list at once (freeze fix, Levi 2026-08-28).
import React, { useDeferredValue, useMemo, useState } from "react";
import Sheet, { Opt } from "./Sheet.jsx";
import { evStart } from "../lib/format.js";
import { displayEventNotes, searchCalendarEvents } from "../lib/calendarLink.js";

/** Visible rows per paint — matches Jobs list paging scale. */
export const CAL_SEARCH_PAGE = 40;

function formatWhen(event) {
  return evStart(event).replace("T", " ").slice(0, 16) || "—";
}

export default function CalendarSearchSheet({ events, title, hint, onPick, onClose }) {
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(CAL_SEARCH_PAGE);
  const deferredQuery = useDeferredValue(query);
  const matches = useMemo(
    () => searchCalendarEvents(events, deferredQuery),
    [events, deferredQuery]
  );
  const visible = matches.slice(0, limit);
  const hasMore = matches.length > limit;

  // Reset page when the search string changes (not on every events poll).
  const onQueryChange = (e) => {
    setQuery(e.target.value);
    setLimit(CAL_SEARCH_PAGE);
  };

  return (
    <Sheet title={title || "Choose from calendar"} onClose={onClose} wide>
      <p className="text-sm text-slate-500 mb-3">
        {hint || "Appointments this year through next year — search by address, customer, notes, or date."}
      </p>
      <input
        className="input mb-3"
        placeholder="Search address, name, notes…"
        value={query}
        onChange={onQueryChange}
        aria-label="Search calendar appointments"
        data-testid="cal-search-input"
        autoFocus
      />
      {matches.length ? (
        <div className="space-y-0" data-testid="cal-search-results">
          {visible.map((e) => {
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
          {hasMore ? (
            <button
              type="button"
              className="btn-ghost w-full mt-2"
              data-testid="cal-search-load-more"
              onClick={() => setLimit((n) => n + CAL_SEARCH_PAGE)}
            >
              Load more ({matches.length - limit} more)
            </button>
          ) : null}
        </div>
      ) : (
        <div className="text-sm text-slate-400 text-center py-8" data-testid="cal-search-empty">
          {query ? "No appointments match your search." : "No calendar events yet — sync calendar first."}
        </div>
      )}
    </Sheet>
  );
}
