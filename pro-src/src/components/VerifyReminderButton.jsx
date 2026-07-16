// Verify button — check reminder against real email/send data, clear if stale.
import React, { useState } from "react";
import { useStore } from "../state/store.jsx";
import {
  VERIFY_HOLD_MS,
  beginVerifyHold,
  releaseReminderAfterVerify,
  reminderItemKey,
  verifyReminderItem,
  verifyResultToast,
} from "../lib/reminderVerify.js";

const IS_TEST = import.meta.env.MODE === "test" || !!import.meta.env.VITEST;

/**
 * @param {object} props
 * @param {object} props.item — reminder list/queue item
 * @param {() => void} [props.onStart] — fire as soon as verify begins (hide sheet)
 * @param {(result: object) => void} [props.onDone] — after check finishes
 * @param {(result: object) => void} [props.onCleared] — only when permanently gone
 * @param {string} [props.className]
 * @param {boolean} [props.primary]
 * @param {string} [props.label] — button text when idle
 */
export default function VerifyReminderButton({
  item,
  onStart,
  onDone,
  onCleared,
  className,
  primary = false,
  label = "✓ Verify",
}) {
  const { jobs, events, commands, refreshJobs, showToast } = useStore();
  const [busy, setBusy] = useState(false);

  if (!item) return null;

  const run = async () => {
    if (busy) return;
    setBusy(true);
    // Hold first so list/queue filters this item out, then hide the sheet.
    beginVerifyHold(reminderItemKey(item));
    onStart && onStart();
    showToast("Checking against real send status…");
    const started = Date.now();
    try {
      const result = await verifyReminderItem(item, {
        jobs,
        events,
        commands,
        refreshJobs,
      });
      // Still needed → keep hidden for ~10s, then release so it can pop back.
      if (result.stillNeeded) {
        const wait = IS_TEST ? 0 : Math.max(0, VERIFY_HOLD_MS - (Date.now() - started));
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        releaseReminderAfterVerify(item);
      }
      showToast(verifyResultToast(result));
      if (result.cleared) onCleared && onCleared(result);
      onDone && onDone(result);
      // Let popups / list rebuild so a still-needed reminder can return.
      try {
        window.dispatchEvent(new CustomEvent("lepro-reminder-verify-done", { detail: result }));
      } catch {
        /* ignore */
      }
    } catch {
      releaseReminderAfterVerify(item);
      showToast("Could not verify right now — try again");
      onDone && onDone({ stillNeeded: true, cleared: false, reason: "error" });
      try {
        window.dispatchEvent(
          new CustomEvent("lepro-reminder-verify-done", { detail: { stillNeeded: true, cleared: false } })
        );
      } catch {
        /* ignore */
      }
    } finally {
      setBusy(false);
    }
  };

  const base =
    className ||
    (primary
      ? "btn bg-violet-100 text-violet-900 w-full border border-violet-200"
      : "btn bg-slate-100 text-slate-800 w-full");

  return (
    <button
      type="button"
      className={base + (busy ? " opacity-70 pointer-events-none" : "")}
      onClick={run}
      disabled={busy}
      data-testid="reminder-verify"
      aria-busy={busy}
    >
      {busy ? "Checking…" : label}
    </button>
  );
}
