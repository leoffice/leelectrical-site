// + FAB flow: manual form OR pick a calendar appointment to prefill.
// Creates an overlay job (_new, local- id) exactly like sleek's createJob.
import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Sheet, { Fld, Opt } from "./Sheet.jsx";
import CustomerSearch from "./CustomerSearch.jsx";
import { useStore } from "../state/store.jsx";
import { evStart, todayStr } from "../lib/format.js";
import { customerPickPatch, namesNearDuplicate } from "../lib/customers.js";
import { serviceAddressHint, serviceAddressLabel } from "../lib/customerSync.js";

/** Prefill parser — enhanced for combined Calendar→Job autofill (#58):
 *  - title from appt summary
 *  - service address from event location
 *  - parse 'customer <name>' from desc to suggest/select QBO customer
 *  - parse apt/apartment/unit/# + num from desc → apartment; remaining text → description
 */
export function prefillFromEvent(e) {
  const desc = e.description || "";
  const pick = (re) => {
    const m = desc.match(re);
    return m ? m[1].trim() : "";
  };

  const aptMatch = desc.match(/\b(?:apt\.?|apartment|unit|suite|#)\s*#?\s*([A-Za-z0-9][A-Za-z0-9-]{0,8})\b/i);
  const apartment = aptMatch ? aptMatch[1].trim() : "";

  let description = desc;
  if (apartment && aptMatch) {
    description = desc.replace(aptMatch[0], "").replace(/\s{2,}/g, " ").trim();
    description = description.replace(/^[,\-–—:\s]+/, "").trim();
  }

  let customer =
    (e.summary || "").replace(/(service call|estimate|install.*?)[—\-:]/i, "").trim() || e.summary || "";
  const custMatch = desc.match(/\bcustomer\s+([A-Za-z][A-Za-z .,'-]{1,30}?(?=\s+(?:apt|apartment|unit|suite|phone|tel|cell|email|rear|call|on|\d)|$|[,.]))/i);
  if (custMatch) {
    customer = custMatch[1].trim().replace(/[,.;]$/, "");
  }

  const title = e.summary || "";

  return {
    customer,
    businessName: customer,
    title,
    address: e.location || "",
    phone: pick(/(?:phone|tel|cell)[:\s]+([\d\-\+\(\) ]{7,})/i),
    email: pick(/([\w.+-]+@[\w-]+\.[\w.]+)/),
    date: evStart(e).slice(0, 10),
    calEventId: e.id || "",
    apartment,
    description,
  };
}

const FIELDS = [
  ["title", "Job title / scope"],
  ["phone", "Phone"],
  ["email", "Email"],
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
      key={(newJob.prefill?.calEventId || "new") + ":" + (newJob.prefill?.customer || "manual")}
      prefill={newJob.prefill || {}}
      onClose={close}
      onCreated={(id) => {
        if (newJob.sasCallId) markSasHandled(newJob.sasCallId, { handled: true, jobId: id });
        nav("/job/" + encodeURIComponent(id));
      }}
    />
  );
}

function NewJobForm({ prefill, onClose, onCreated }) {
  const { createJob, jobs, api } = useStore();
  const [f, setF] = useState(() => {
    const o = { date: prefill.date || "" };
    FIELDS.forEach(([k]) => (o[k] = prefill[k] || ""));
    o.businessName = prefill.businessName || prefill.customer || "";
    o.personName = prefill.personName || "";
    o.customer = o.businessName;
    o.serviceAddress = prefill.serviceAddress || prefill.address || "";
    o.apartment = prefill.apartment || "";
    o.billingAddress = prefill.billingAddress || "";
    o.qboCustomerId = prefill.qboCustomerId || "";
    o.description = prefill.description || "";
    return o;
  });
  const autoFilledRef = useRef("");
  const fRef = useRef(f);
  fRef.current = f;
  useEffect(() => {
    const cust = prefill ? String(prefill.customer || "").trim() : "";
    const token = (prefill.calEventId || "manual") + ":" + cust;
    if (!cust || prefill.qboCustomerId || autoFilledRef.current === token) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await api.searchCustomers(cust);
        if (!Array.isArray(list) || !list.length) return;
        const exact = list.find((c) => String(c.name || "").toLowerCase() === cust.toLowerCase());
        const near = list.find((c) => namesNearDuplicate(c.name, cust));
        const match = exact || near || (list.length === 1 ? list[0] : null);
        if (!match) return;
        const patch = customerPickPatch(match, jobs);
        if (cancelled) return;
        autoFilledRef.current = token;
        setF((o) => ({
          ...o,
          businessName: patch.businessName || patch.customer || o.businessName,
          personName: o.personName || patch.personName || "",
          customer: patch.businessName || patch.customer || o.customer,
          qboCustomerId: patch.qboCustomerId || o.qboCustomerId || "",
          phone: o.phone || patch.phone || "",
          email: o.email || patch.email || "",
          billingAddress: o.billingAddress || patch.billingAddress || "",
          serviceAddress: o.serviceAddress || "",
          apartment: o.apartment || patch.apartment || "",
        }));
      } catch {
        // keep prefilled values
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [prefill, api, jobs]);

  const set = (k) => (e) => setF((o) => ({ ...o, [k]: e.target.value }));

  const pickCustomer = (c) => {
    const patch = customerPickPatch(c, jobs);
    const biz = patch.businessName || patch.customer || "";
    setF((o) => ({
      ...o,
      businessName: biz,
      personName: patch.personName || o.personName || "",
      customer: biz,
      qboCustomerId: patch.qboCustomerId || "",
      phone: patch.phone || o.phone || "",
      email: patch.email || o.email || "",
      billingAddress: patch.billingAddress || o.billingAddress || "",
      serviceAddress: o.serviceAddress || patch.serviceAddress || "",
      apartment: o.apartment || patch.apartment || "",
    }));
  };

  const create = async () => {
    const cur = fRef.current;
    const payload = {
      businessName: cur.businessName || cur.customer,
      personName: cur.personName || "",
      customer: cur.businessName || cur.customer,
      title: cur.title,
      phone: cur.phone,
      email: cur.email,
      address: cur.serviceAddress,
      serviceAddress: cur.serviceAddress,
      apartment: cur.apartment,
      billingAddress: cur.billingAddress || "",
      invoiceNo: cur.invoiceNo,
      date: cur.date,
      qboCustomerId: cur.qboCustomerId,
      description: cur.description || "",
    };
    const id = await createJob(payload, prefill.calEventId || "");
    if (id) {
      onClose();
      onCreated && onCreated(id);
    }
  };

  return (
    <Sheet title="New job — details" onClose={onClose}>
      <Fld label="Business name" hint="Search existing QuickBooks customers, or add a new one">
        <CustomerSearch
          label="Business name"
          testId="newjob-business-name"
          value={f.businessName || f.customer}
          onChangeText={(v) => setF((o) => ({ ...o, businessName: v, customer: v, qboCustomerId: "" }))}
          onPick={pickCustomer}
        />
      </Fld>
      <Fld label="Person name" hint="Contact person (optional)">
        <input className="input" value={f.personName} onChange={set("personName")} aria-label="Person name" />
      </Fld>

      <Fld label="Job title / scope">
        <input className="input" value={f.title} onChange={set("title")} aria-label="Job title / scope" />
      </Fld>
      <Fld label="Description" hint="From calendar (apt/unit parsed out to Apartment # field)">
        <textarea
          className="input min-h-[60px]"
          value={f.description}
          onChange={set("description")}
          aria-label="Description"
        />
      </Fld>
      <Fld label="Phone">
        <input className="input" value={f.phone} onChange={set("phone")} aria-label="Phone" />
      </Fld>
      <Fld label="Email">
        <input className="input" value={f.email} onChange={set("email")} aria-label="Email" />
      </Fld>
      <Fld label="Billing address" hint="QuickBooks billing address (customer)">
        <input className="input" value={f.billingAddress} onChange={set("billingAddress")} aria-label="Billing address" />
      </Fld>

      <Fld label={serviceAddressLabel(f)} hint={serviceAddressHint(f)}>
        <input
          className="input"
          value={f.serviceAddress}
          onChange={set("serviceAddress")}
          aria-label={serviceAddressLabel(f)}
        />
      </Fld>
      <Fld label="Apartment #" hint="Unit / apt at the service address (optional)">
        <input className="input" value={f.apartment} onChange={set("apartment")} aria-label="Apartment #" />
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