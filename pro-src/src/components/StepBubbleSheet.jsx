// Tap an awareness bubble → custom done label, Skip, Revert, or calendar for dated steps.
import React from "react";
import Sheet, { Opt } from "./Sheet.jsx";
import { bubbleCompleteLabel } from "../lib/bubbleHandlers.js";
import { bubbleStepMeta } from "../lib/jobAwareness.js";

export default function StepBubbleSheet({
  bubble,
  onClose,
  onComplete,
  onSkip,
  onRevert,
  onCalendar,
  onOpen,
}) {
  if (!bubble) return null;
  const meta = bubbleStepMeta(bubble);
  const doneLabel = bubbleCompleteLabel(bubble);
  const canOpen =
    bubble.action === "open-estimate" ||
    bubble.action === "open-invoice" ||
    bubble.action === "create-estimate" ||
    bubble.action === "create-invoice";
  const showCalendar = (meta.isInspection || meta.needsDate) && onCalendar;

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
      {bubble.action === "record-deposit" && onOpen ? (
        <Opt icon="💳" title="Record deposit" note="Open payment menu" onClick={() => onOpen(bubble)} data-testid="bubble-pay" />
      ) : null}
      <Opt
        icon="✓"
        title={doneLabel}
        note="Mark this step done and move to the next"
        onClick={() => onComplete(bubble)}
        data-testid="bubble-complete"
      />
      {showCalendar ? (
        <Opt
          icon="📅"
          title="Schedule on calendar"
          note="Create or link a Google Calendar appointment"
          onClick={() => onCalendar(bubble)}
          data-testid="bubble-calendar"
        />
      ) : null}
      <Opt icon="⏭" title="Skip" note="Skip this step for now" onClick={() => onSkip(bubble)} data-testid="bubble-skip" />
      {onRevert ? (
        <Opt
          icon="↩"
          title="Revert to previous step"
          note="Undo this step and go back one"
          onClick={() => onRevert(bubble)}
          data-testid="bubble-revert"
        />
      ) : null}
      <button type="button" className="btn-ghost w-full mt-2" onClick={onClose}>
        Exit
      </button>
    </Sheet>
  );
}