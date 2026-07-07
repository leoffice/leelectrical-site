// Pick customer → job (or create new) → confirm → save & sync link.
import React, { useMemo, useState } from "react";
import Sheet, { Opt } from "./Sheet.jsx";
import { prefillFromEvent } from "./NewJobFlow.jsx";
import { useStore } from "../state/store.jsx";
import { fmtAmountDue, totalBalanceDue } from "../lib/customers.js";
import { applyAppointmentJobLink, customerJobGroups } from "../lib/calendarLink.js";
import { fmt$ } from "../lib/format.js";

export default function LinkJobSheet({ event, previousJobId, onClose, onLinked }) {
  const { jobs, patchAndSave, enqueue, patchLocalEvent, setNewJob, showToast } = useStore();
  const [expanded, setExpanded] = useState({});
  const [picked, setPicked] = useState(null); // job | { _newFor: customerName }

  const groups = useMemo(() => customerJobGroups(jobs), [jobs]);

  const toggle = (key) => setExpanded((o) => ({ ...o, [key]: !o[key] }));

  const createForCustomer = (customerName) => {
    onClose();
    setNewJob({
      step: "form",
      prefill: {
        ...prefillFromEvent(event),
        customer: customerName,
        businessName: customerName,
        calEventId: event.id || "",
      },
    });
    showToast("New job for " + customerName);
  };

  const confirmLink = async () => {
    if (!picked || picked._newFor) return;
    await applyAppointmentJobLink({
      event,
      job: picked,
      jobs,
      previousJobId,
      patchAndSave,
      enqueue,
      patchLocalEvent,
    });
    showToast("Linked & synced to " + (picked.customer || "job"));
    onLinked && onLinked(picked);
    onClose();
  };

  if (picked && !picked._newFor) {
    return (
      <Sheet title="Confirm link" onClose={() => setPicked(null)}>
        <p className="text-sm text-slate-500 mb-3">Link this appointment to:</p>
        <div className="card px-4 py-3 mb-4">
          <div className="font-bold text-slate-900">{picked.customer || picked.businessName || "—"}</div>
          <div className="text-sm text-slate-500 mt-0.5">{picked.title || "No title"}</div>
          {(fmtAmountDue(picked) || picked.amount) && (
            <div className="text-sm font-semibold text-slate-700 mt-1">{fmtAmountDue(picked) || picked.amount}</div>
          )}
        </div>
        <button type="button" className="btn-brand w-full" onClick={confirmLink}>
          Save &amp; sync
        </button>
        <button type="button" className="btn-ghost w-full mt-2" onClick={() => setPicked(null)}>
          Back
        </button>
      </Sheet>
    );
  }

  return (
    <Sheet title="Link to existing job" onClose={onClose}>
      <p className="text-sm text-slate-500 mb-3">Tap a customer to see their open jobs.</p>
      {groups.length ? (
        <div className="space-y-2">
          {groups.map(([key, list]) => {
            const name = list[0].customer || "(no customer)";
            const open = !!expanded[key];
            const unpaid = list.filter((j) => !j.paid).length;
            return (
              <div key={key} className="card overflow-hidden" data-testid="link-customer-group">
                <button
                  type="button"
                  className="w-full flex items-center gap-3 px-4 py-3 text-left"
                  onClick={() => toggle(key)}
                  data-testid="link-customer-toggle"
                >
                  <span className="grid place-items-center w-9 h-9 rounded-xl bg-accent-soft text-accent font-bold text-sm shrink-0">
                    {name.trim().slice(0, 1).toUpperCase() || "?"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-slate-900 truncate">{name}</span>
                    <span className="block text-xs text-slate-500">
                      {list.length} job{list.length === 1 ? "" : "s"} · {unpaid} unpaid ·{" "}
                      <b className="text-slate-700">{fmt$(totalBalanceDue(list)) || "$0"} due</b>
                    </span>
                  </span>
                  <span className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
                </button>
                {open && (
                  <div className="px-3 pb-3 space-y-1.5 bg-slate-50/60 border-t border-slate-100 pt-3">
                    {list.map((j) => (
                      <Opt
                        key={j.id}
                        icon="🗂️"
                        title={j.title || "Untitled job"}
                        note={fmtAmountDue(j) || fmt$(j.amount) || j.id}
                        onClick={() => setPicked(j)}
                      />
                    ))}
                    <Opt
                      icon="＋"
                      title={"Create new job for " + name}
                      note="Prefill from this appointment"
                      onClick={() => createForCustomer(name)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-sm text-slate-400 text-center py-6">No open jobs.</div>
      )}
    </Sheet>
  );
}