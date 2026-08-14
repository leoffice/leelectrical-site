// Partial Service questionnaire — date it happened, Con Ed ticket #, approve
// the initial visit hours + hourly rate. Confirms into BOTH invoice lines
// (emergency visit + follow-up visit). See lib/partialService.js.
import React, { useMemo, useState } from "react";
import Sheet, { Fld } from "./Sheet.jsx";
import {
  PARTIAL_SERVICE_FOLLOWUP_RATE,
  PARTIAL_SERVICE_INITIAL_HOURS,
  PARTIAL_SERVICE_INITIAL_RATE,
  buildPartialServiceLines,
} from "../lib/partialService.js";
import { parseAmount } from "../lib/format.js";

/** Cents-accurate money for visit math — fmt$ rounds $397.50 up to $398. */
function money2(n) {
  return (
    "$" +
    Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

function todayIso() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function PartialServiceSheet({ line, followUpLine, onClose, onConfirm }) {
  const [serviceDate, setServiceDate] = useState(
    () => String(line?.partialServiceDate || "") || todayIso()
  );
  const [ticketNo, setTicketNo] = useState(() => String(line?.conedTicketNo || ""));
  const [hoursStr, setHoursStr] = useState(() => {
    const q = parseAmount(line?.partialService ? line?.qty : "");
    return q > 0 ? String(q) : String(PARTIAL_SERVICE_INITIAL_HOURS);
  });
  // Per-visit rates (Levi 2026-08-14): emergency $265/hr, follow-up $225/hr.
  const [rateStr, setRateStr] = useState(() => {
    const r =
      parseAmount(line?.partialService ? line?.unitPrice : "") || PARTIAL_SERVICE_INITIAL_RATE;
    return String(r);
  });
  const [followRateStr, setFollowRateStr] = useState(() => {
    const r =
      parseAmount(followUpLine?.partialService ? followUpLine?.unitPrice : "") ||
      PARTIAL_SERVICE_FOLLOWUP_RATE;
    return String(r);
  });

  const hours = parseAmount(hoursStr) || PARTIAL_SERVICE_INITIAL_HOURS;
  const rate = parseAmount(rateStr) || 0;
  const followUpRate = parseAmount(followRateStr) || 0;
  const preview = useMemo(
    () =>
      buildPartialServiceLines({ serviceDate, ticketNo, initialHours: hours, rate, followUpRate }),
    [serviceDate, ticketNo, hours, rate, followUpRate]
  );
  const total = preview.reduce((s, ln) => s + ln.qty * ln.unitPrice, 0);

  return (
    <Sheet title="Partial service — power outage" onClose={onClose}>
      <p className="text-sm text-slate-500 mb-3">
        Adds both visits to this invoice: the emergency visit (temporary bridge) and the
        follow-up visit. The Con Ed refund instructions go out in the email — not on the
        invoice.
      </p>
      <Fld label="Date it happened">
        <input
          type="date"
          className="input"
          value={serviceDate}
          onChange={(e) => setServiceDate(e.target.value)}
          aria-label="Partial service date"
          data-testid="partial-date"
        />
      </Fld>
      <Fld label="Con Ed ticket number" hint="If we have one — goes into the line description">
        <input
          className="input"
          value={ticketNo}
          onChange={(e) => setTicketNo(e.target.value)}
          placeholder="Ticket # (optional)"
          aria-label="Con Ed ticket number"
          data-testid="partial-ticket"
        />
      </Fld>
      <div className="grid grid-cols-3 gap-2">
        <Fld label="Initial visit (hours)" hint="Standard is 1.5 hours">
          <input
            className="input tabular-nums"
            inputMode="decimal"
            value={hoursStr}
            onChange={(e) => setHoursStr(e.target.value)}
            aria-label="Initial visit hours"
            data-testid="partial-hours"
          />
        </Fld>
        <Fld label="Emergency rate / hr">
          <input
            className="input tabular-nums"
            inputMode="decimal"
            value={rateStr}
            onChange={(e) => setRateStr(e.target.value)}
            aria-label="Emergency visit rate per hour"
            data-testid="partial-rate"
          />
        </Fld>
        <Fld label="Follow-up rate / hr">
          <input
            className="input tabular-nums"
            inputMode="decimal"
            value={followRateStr}
            onChange={(e) => setFollowRateStr(e.target.value)}
            aria-label="Follow-up visit rate per hour"
            data-testid="partial-followup-rate"
          />
        </Fld>
      </div>
      <p
        className="text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mb-3"
        data-testid="partial-rate-note"
      >
        Confirm the rates — standard is {money2(PARTIAL_SERVICE_INITIAL_RATE)}/hr for the
        emergency visit and {money2(PARTIAL_SERVICE_FOLLOWUP_RATE)}/hr for the follow-up
        (Levi 2026-08-14). Both editable here.
      </p>

      <div
        className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 mb-3 text-xs text-slate-700 space-y-2"
        data-testid="partial-preview"
      >
        {preview.map((ln, i) => (
          <div key={i}>
            <div className="font-bold text-slate-800">
              {i === 0 ? "1 · Emergency visit" : "2 · Follow-up visit"} — {ln.qty} ×{" "}
              {money2(ln.unitPrice)} = {money2(ln.qty * ln.unitPrice)}
            </div>
            <div className="whitespace-pre-wrap text-slate-600">{ln.description}</div>
          </div>
        ))}
        <div className="font-extrabold text-slate-900 text-sm">Total {money2(total)}</div>
      </div>

      <button
        type="button"
        className="btn-brand w-full"
        disabled={!(rate > 0) || !(followUpRate > 0) || !(hours > 0)}
        onClick={() =>
          onConfirm({ serviceDate, ticketNo, initialHours: hours, rate, followUpRate })
        }
        data-testid="partial-confirm"
      >
        Add both visit items
      </button>
    </Sheet>
  );
}
