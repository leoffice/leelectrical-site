// + FAB flow: manual form OR pick a calendar appointment to prefill.
// Creates an overlay job (_new, local- id) exactly like sleek's createJob.
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import Sheet, { Fld, Opt } from "./Sheet.jsx";
import CustomerSearch from "./CustomerSearch.jsx";
import { useStore } from "../state/store.jsx";
import { evStart, todayStr } from "../lib/format.js";
import { customerPickPatch } from "../lib/customers.js";

/** Prefill parser — copied from sleek's prefillFromEvent. */
export function prefillFromEvent(e) {
  const desc = e.description || "";
  const pick = (re) => {
    const m = desc.match(re);
    return m ? m[1].trim() : "";
  };
  return {
    customer:
      (e.summary || "").replace(/(service call|estimate|install.*?)[—\-:]/i, "").trim() || e.summary || "",
    title: e.summary || "",
    address: e.location || "",
    phone: pick(/(?:phone|tel|cell)[:\s]+([\d\-\+\(\) ]{7,})/i),
    email: pick(/([\w.+-]+@[\w-]+\.[\w.]+)/),
    date: evStart(e).slice(0, 10),
    calEventId: e.id || "",
  };
}

// Non-customer text fields (customer name has its own smart-search field, and
// the two addresses + apartment get bespoke layout — see NewJobForm).
const FIELDS = [
  ["title", "Job title / scope"],
  ["amount", "Amount ($)"],
  ["phone", "Phone"],
  ["email", "Email"],
  ["estimateNo", "Estimate #"],
  ["invoiceNo", "Invoice #"],
];

export default function NewJobFlow() {
  const { newJob, setNewJob, events, markSasHandled } = useStore();
  const nav = useNavigate();
  if (!newJob) return null;
  const close = () => setNewJob(null);

  if (newJob.step === "choose")
    return (
      <Sheet title="New job" onClose={close}>
        <Opt icon="✍️" title="Enter manually" note="Type the customer & details" onClick={() => setNewJob({ step: "form", prefill: {} })} />
        <Opt icon="📅" title="Choose from calendar" note="Prefill from an upcoming appointment" onClick={() => setNewJob({ step: "cal" })} />
      </Sheet>
    );

  if (newJob.step === "cal") {
    // Window: 2 weeks back through 1 week ahead, excluding "inspection" events.
    const fromD = new Date(); fromD.setDate(fromD.getDate() - 14);
    const toD = new Date(); toD.setDate(toD.getDate() + 7);
    const fromStr = fromD.toISOString().slice(0, 10);
    const toStr = toD.toISOString().slice(0, 10);
    const evs = (events || [])
      .filter((e) => {
        const d = evStart(e).slice(0, 10);
        return d >= fromStr && d <= toStr && !/inspection/i.test(e.summary || "");
      })
      .sort((a, b) => (evStart(a) > evStart(b) ? -1 : 1))
      .slice(0, 30);
    return (
      <Sheet title="Pick an appointment" onClose={close}>
        {evs.length ? (
          evs.map((e, i) => (
            <Opt
              key={e.id || i}
              icon="📅"
              title={e.summary || "Appointment"}
              note={evStart(e).replace("T", " ").slice(0, 16) + (e.location ? " · " + e.location : "")}
              onClick={() => setNewJob({ step: "form", prefill: prefillFromEvent(e) })}
            />
          ))
        ) : (
          <div className="text-sm text-slate-400 text-center py-6">No synced appointments yet.</div>
        )}
      </Sheet>
    );
  }

  return (
    <NewJobForm
      prefill={newJob.prefill || {}}
      onClose={close}
      onCreated={(id) => {
        // SAS lead ticket → job: mark the originating ticket handled + link it.
        if (newJob.sasCallId) markSasHandled(newJob.sasCallId, { handled: true, jobId: id });
        nav("/job/" + encodeURIComponent(id));
      }}
    />
  );
}

function NewJobForm({ prefill, onClose, onCreated }) {
  const { createJob, jobs } = useStore();
  const [f, setF] = useState(() => {
    const o = { date: prefill.date || "" };
    FIELDS.forEach(([k]) => (o[k] = prefill[k] || ""));
    // Service address keeps the canonical `serviceAddress`/legacy `address`
    // prefill; billing + apartment start empty unless prefilled.
    o.customer = prefill.customer || "";
    o.serviceAddress = prefill.serviceAddress || prefill.address || "";
    o.apartment = prefill.apartment || "";
    o.billingAddress = prefill.billingAddress || "";
    o.qboCustomerId = prefill.qboCustomerId || "";
    return o;
  });
  // Billing defaults to "same as service" — only splits when Levi unchecks it.
  const [billingSame, setBillingSame] = useState(!prefill.billingAddress);
  const set = (k) => (e) => setF((o) => ({ ...o, [k]: e.target.value }));

  // #55 — picking an existing customer prefills their details (name + linked
  // QBO id + contact fields pulled from that customer's existing jobs). See
  // customerPickPatch in lib/customers.js.
  const pickCustomer = (c) => setF((o) => ({ ...o, ...customerPickPatch(c, jobs) }));

  const create = async () => {
    const payload = {
      customer: f.customer,
      title: f.title,
      amount: f.amount,
      phone: f.phone,
      email: f.email,
      // `address` stays the canonical service address (grouping/detail read it).
      address: f.serviceAddress,
      serviceAddress: f.serviceAddress,
      apartment: f.apartment,
      billingAddress: billingSame ? f.serviceAddress : f.billingAddress,
      estimateNo: f.estimateNo,
      invoiceNo: f.invoiceNo,
      date: f.date,
      qboCustomerId: f.qboCustomerId,
    };
    const id = await createJob(payload, prefill.calEventId || "");
    if (id) {
      onClose();
      onCreated && onCreated(id);
    }
  };

  return (
    <Sheet title="New job — details" onClose={onClose}>
      <Fld label="Customer name" hint="Search existing QuickBooks customers, or add a new one">
        <CustomerSearch
          value={f.customer}
          onChangeText={(v) => setF((o) => ({ ...o, customer: v, qboCustomerId: "" }))}
          onPick={pickCustomer}
        />
      </Fld>

      <Fld label="Job title / scope">
        <input className="input" value={f.title} onChange={set("title")} aria-label="Job title / scope" />
      </Fld>
      <Fld label="Amount ($)">
        <input className="input" value={f.amount} onChange={set("amount")} aria-label="Amount ($)" />
      </Fld>
      <Fld label="Phone">
        <input className="input" value={f.phone} onChange={set("phone")} aria-label="Phone" />
      </Fld>
      <Fld label="Email">
        <input className="input" value={f.email} onChange={set("email")} aria-label="Email" />
      </Fld>

      <Fld label="Service address">
        <input
          className="input"
          value={f.serviceAddress}
          onChange={set("serviceAddress")}
          aria-label="Service address"
        />
      </Fld>
      <Fld label="Apartment #" hint="Unit / apt at the service address (optional)">
        <input className="input" value={f.apartment} onChange={set("apartment")} aria-label="Apartment #" />
      </Fld>

      <Fld label="Billing address">
        <label className="flex items-center gap-2 mb-1.5 text-xs font-semibold text-slate-500">
          <input
            type="checkbox"
            checked={billingSame}
            onChange={(e) => setBillingSame(e.target.checked)}
            aria-label="Billing same as service address"
          />
          Same as service address
        </label>
        {!billingSame && (
          <input
            className="input"
            value={f.billingAddress}
            onChange={set("billingAddress")}
            aria-label="Billing address"
          />
        )}
      </Fld>

      <Fld label="Estimate #">
        <input className="input" value={f.estimateNo} onChange={set("estimateNo")} aria-label="Estimate #" />
      </Fld>
      <Fld label="Invoice #">
        <input className="input" value={f.invoiceNo} onChange={set("invoiceNo")} aria-label="Invoice #" />
      </Fld>

      <Fld label="Scheduled date">
        <input className="input" type="date" value={f.date} onChange={set("date")} aria-label="Scheduled date" />
      </Fld>
      <button className="btn-brand w-full" onClick={create}>
        Create job
      </button>
    </Sheet>
  );
}
