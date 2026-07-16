// Parallel actions for unsent invoice/estimate reminders:
// Open · Verify · Remind Me Later · Don't Remind Me
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Fld } from "./Sheet.jsx";
import ReminderDateTimePicker from "./ReminderDateTimePicker.jsx";
import VerifyReminderButton from "./VerifyReminderButton.jsx";
import { useStore } from "../state/store.jsx";
import { todayStr } from "../lib/format.js";
import {
  defaultRemindDatetime,
  validateRemindDatetime,
} from "../lib/followUpReminders.js";
import {
  dismissUnsentDoc,
  snoozeUnsentDoc,
  unsentDocPath,
} from "../lib/followUpStatus.js";

const BTN =
  "btn bg-slate-100 text-slate-800 w-full border border-slate-200 !py-2.5 text-sm font-bold";

/**
 * @param {object} props
 * @param {object} props.job
 * @param {"invoice"|"estimate"} props.docKind
 * @param {string} [props.docNo]
 * @param {() => void} [props.onOpen] — before navigating to the doc
 * @param {() => void} [props.onAction] — after dismiss / snooze / verify start (refresh list)
 * @param {() => void} [props.onVerifyStart]
 * @param {() => void} [props.onVerifyDone]
 * @param {() => void} [props.onClose] — close parent sheet after dismiss/snooze
 * @param {boolean} [props.mb] — add bottom margin on the stack
 */
export default function UnsentDocActions({
  job,
  docKind,
  docNo,
  onOpen,
  onAction,
  onVerifyStart,
  onVerifyDone,
  onClose,
  mb = false,
}) {
  const nav = useNavigate();
  const { showToast } = useStore();
  const [picking, setPicking] = useState(false);
  const [dt, setDt] = useState(() => defaultRemindDatetime());
  const today = todayStr();
  const label = docKind === "invoice" ? "invoice" : "estimate";

  const openDoc = () => {
    onOpen && onOpen();
    if (job?.id) nav(unsentDocPath(job, docKind));
  };

  const dontRemind = () => {
    if (!job?.id || !docKind) return;
    dismissUnsentDoc(job.id, docKind);
    showToast("OK — won't remind you about this " + label);
    onAction && onAction();
    onClose && onClose();
  };

  const saveRemindLater = () => {
    if (!job?.id || !docKind) return;
    const err = validateRemindDatetime(dt);
    if (err) {
      showToast(err);
      return;
    }
    snoozeUnsentDoc(job.id, docKind, dt);
    showToast("OK — I'll remind you " + dt.replace("T", " ").slice(0, 16));
    setPicking(false);
    onAction && onAction();
    onClose && onClose();
  };

  const verifyItem = {
    id: "unsent:" + (job?.id || "") + ":" + docKind,
    kind: "unsent_doc",
    job,
    docKind,
    docNo,
  };

  if (picking) {
    return (
      <div className={mb ? "mb-2" : ""} data-testid="unsent-doc-remind-picker">
        <p className="text-sm text-slate-600 mb-3">
          When should I bring this unsent {label} back up?
        </p>
        <Fld label="Day & time" hint="Weekdays during work hours">
          <ReminderDateTimePicker value={dt} onChange={setDt} minDate={today} />
        </Fld>
        <button
          type="button"
          className="btn-brand w-full mb-2"
          onClick={saveRemindLater}
          data-testid="unsent-doc-remind-save"
        >
          Save reminder time
        </button>
        <button
          type="button"
          className={BTN}
          onClick={() => setPicking(false)}
          data-testid="unsent-doc-remind-cancel"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className={mb ? "mb-2" : ""} data-testid="unsent-doc-actions">
      <div className="grid grid-cols-1 gap-2">
        <button type="button" className={BTN} onClick={openDoc} data-testid="unsent-doc-open">
          Open
        </button>
        <VerifyReminderButton
          item={verifyItem}
          label="Verify"
          className={BTN}
          onStart={() => {
            onVerifyStart && onVerifyStart();
            onAction && onAction();
          }}
          onDone={(result) => {
            onVerifyDone && onVerifyDone(result);
            onAction && onAction();
          }}
        />
        <button
          type="button"
          className={BTN}
          onClick={() => setPicking(true)}
          data-testid="unsent-doc-remind-later"
        >
          Remind Me Later
        </button>
        <button
          type="button"
          className={BTN}
          onClick={dontRemind}
          data-testid="unsent-doc-dismiss"
        >
          Don't Remind Me
        </button>
      </div>
    </div>
  );
}
