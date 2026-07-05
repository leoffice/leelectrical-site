// Calls — SAS answering-service lead tickets. These are LEADS, not
// QuickBooks customers: no QBO commands are ever issued from this tab.
// "Convert to job" reuses the EXISTING new-job flow (NewJobFlow form,
// prefilled from the call → overlay job at stage Lead); "Dismiss" just marks
// the ticket handled. Handled state lives in the ov overlay under the
// reserved key ov._sasTickets = { [callId]: { handled, jobId?, ts } }.
import React from "react";
import { Link } from "react-router-dom";
import { useStore } from "../state/store.jsx";
import { ago } from "../lib/format.js";
import {
  callAppointment,
  callMessage,
  callName,
  callPhone,
  callType,
  callWhen,
  isHandled,
  prefillFromCall,
} from "../lib/sas.js";

function CallCard({ call, ticket, onConvert, onDismiss }) {
  const handled = !!(ticket && ticket.handled);
  const name = callName(call);
  const phone = callPhone(call);
  const msg = callMessage(call);
  const type = callType(call);
  const when = callWhen(call);
  const appt = callAppointment(call);
  return (
    <div className={`card px-4 py-3.5 ${handled ? "opacity-60" : ""}`} data-testid="call-card">
      <div className="flex items-start gap-2">
        <div className="min-w-0">
          <div className="font-bold text-slate-900 truncate">{name}</div>
          {phone ? (
            <a href={`tel:${phone}`} className="text-sm font-semibold text-brand">
              📞 {phone}
            </a>
          ) : (
            <span className="text-sm text-slate-400">no callback number</span>
          )}
        </div>
        <div className="ml-auto text-right shrink-0">
          <div className="text-xs text-slate-400">{when ? ago(when) : ""}</div>
          {handled ? (
            <span className="pill bg-emerald-100 text-emerald-700 mt-1">Handled ✓</span>
          ) : (
            <span className="pill bg-red-600 text-white mt-1" data-testid="call-new">NEW</span>
          )}
        </div>
      </div>

      {msg && <p className="mt-2 text-sm text-slate-600 whitespace-pre-wrap">{msg}</p>}

      <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
        {type && <span className="pill bg-sky-100 text-sky-700">{type}</span>}
        {appt && <span className="pill bg-brand-soft text-brand">📅 {appt}</span>}
        <span className="pill bg-slate-100 text-slate-500 ml-auto">Lead · not in QuickBooks</span>
      </div>

      {handled ? (
        ticket.jobId ? (
          <div className="mt-2.5">
            <Link
              to={`/job/${encodeURIComponent(ticket.jobId)}`}
              className="block text-center text-xs font-bold text-brand bg-brand-soft rounded-lg py-1.5"
            >
              Open job ›
            </Link>
          </div>
        ) : null
      ) : (
        <div className="mt-2.5 flex gap-1.5">
          <button className="flex-1 text-xs font-bold text-white bg-slate-900 rounded-lg py-2" onClick={onConvert}>
            ⚡ Convert to job
          </button>
          <button className="flex-1 text-xs font-bold text-slate-500 bg-slate-100 rounded-lg py-2" onClick={onDismiss}>
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

export default function Calls() {
  const { sasCalls, sasTickets, setNewJob, markSasHandled, showToast } = useStore();
  const calls = [...(sasCalls || [])].sort((a, b) => callWhen(b) - callWhen(a));
  const fresh = calls.filter((c) => !isHandled(sasTickets, c.id));
  const done = calls.filter((c) => isHandled(sasTickets, c.id));

  const convert = (c) =>
    setNewJob({ step: "form", prefill: prefillFromCall(c), sasCallId: c.id });
  const dismiss = (c) => {
    markSasHandled(c.id, { handled: true, dismissed: true });
    showToast("Ticket dismissed");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-2">
        <h1 className="font-extrabold text-lg text-slate-900">📞 Calls</h1>
        <span className="text-xs text-slate-400">
          answering-service leads · {fresh.length} new
        </span>
      </div>

      {!calls.length ? (
        <div className="card px-4 py-10 text-center text-slate-400 text-sm">
          <span className="block text-3xl mb-2">📞</span>
          No calls from the answering service yet.
        </div>
      ) : (
        <div className="space-y-2.5">
          {fresh.map((c) => (
            <CallCard key={c.id} call={c} ticket={sasTickets[c.id]} onConvert={() => convert(c)} onDismiss={() => dismiss(c)} />
          ))}
          {done.length > 0 && (
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wide pt-2">Handled</div>
          )}
          {done.map((c) => (
            <CallCard key={c.id} call={c} ticket={sasTickets[c.id]} />
          ))}
        </div>
      )}
    </div>
  );
}
