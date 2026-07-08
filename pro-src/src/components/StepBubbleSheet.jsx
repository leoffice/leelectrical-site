// Tap an awareness bubble → Complete, Skip, or open calendar for dated steps.
import React from "react";
import Sheet, { Opt } from "./Sheet.jsx";
import { bubbleStepMeta } from "../lib/jobAwareness.js";

export default function StepBubbleSheet({ bubble, onClose, onComplete, onSkip, onCalendar, onOpen }) {
  if (!bubble) return null;
  const meta = bubbleStepMeta(bubble);
  const canOpen = bubble.action === "open-estimate" || bubble.action === "open-invoice" || bubble.action === "create-estimate" || bubble.action === "create-invoice";

  return (
    <Sheet title={`${bubble.branchLabel} — ${bubble.upNext}`} onClose={onClose}>
      {canOpen && onOpen ? (
        <Opt
          icon="📂"
          title={bubble.action?.includes("invoice") ? "Open billing" : "Open estimate"}
          note="View or finish this document"
          onClick={() => onOpen(bubble)}
          data-testid="bubble-open"
        />
      ) : null}
      <Opt icon="✓" title="Complete" note="Mark this step done and move to the next" onClick={() => onComplete(bubble)} data-testid="bubble-complete" />
      <Opt icon="⏭" title="Skip" note="Skip this step for now" onClick={() => onSkip(bubble)} data-testid="bubble-skip" />
      {meta.isInspection && onCalendar ? (
        <Opt
          icon="📅"
          title="Schedule on calendar"
          note="Create or link a Google Calendar appointment"
          onClick={() => onCalendar(bubble)}
          data-testid="bubble-calendar"
        />
      ) : null}
      <button type="button" className="btn-ghost w-full mt-2" onClick={onClose}>
        Exit
      </button>
    </Sheet>
  );
}