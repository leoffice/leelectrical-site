// + FAB flow: manual form, searchable calendar pick, or add appointment.
import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Sheet, { Fld, Opt } from "./Sheet.jsx";
import CustomerSearch from "./CustomerSearch.jsx";
import CustomerLiveMatch from "./CustomerLiveMatch.jsx";
import CalendarSearchSheet from "./CalendarSearchSheet.jsx";
import AddAppointmentSheet from "./AddAppointmentSheet.jsx";
import { useStore } from "../state/store.jsx";
import { evStart, todayStr } from "../lib/format.js";
import {
  customerKeyForName,
  customerKeyForImport,
  customerPickPatch,
  fmtAmountDue,
  jobsForCustomerKey,
  namesNearDuplicate,
  openBalance,
  openDocsForCustomer,
  PENDING_IMPORT_LS,
} from "../lib/customers.js";
import { MarkPaidSheet } from "./JobSheets.jsx";
import InvoiceCreateSheet, { ProgressPctSheet } from "./InvoiceCreateSheet.jsx";
import DocBuilderSheet from "./DocBuilderSheet.jsx";
import { fmt$ } from "../lib/format.js";
import { sortJobs } from "../lib/stages.js";
import { serviceAddressHint, serviceAddressLabel, customerSyncPayload } from "../lib/customerSync.js";
import {
  createNewCustomerDisabled,
  customerFormDiffersFromBaseline,
  resolveAddCustomerAction,
  snapshotCustomerForm,
} from "../lib/addCustomerFlow.js";

/** Prefill parser — enhanced for combined Calendar→Job autofill (#58). */
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

const CONTACT_FIELDS = [
  ["phone", "Phone"],
  ["email", "Email"],
];

export async function enrichAndPatchCustomer(customer, jobs, api) {
  let c = customer || {};
  if (c.id != null && !c._newCustomer) {
    const detail = await api.getCustomer(c.id);
    if (detail) c = { ...c, ...detail };
  }
  return customerPickPatch(c, jobs);
}

function mergeCustomerPatch(o, patch, { keepServiceAddress } = {}) {
  const biz = patch.businessName || patch.customer || "";
  return {
    ...o,
    businessName: biz || o.businessName,
    personName: patch.personName || o.personName || "",
    customer: biz || o.customer,
    qboCustomerId: patch.qboCustomerId || o.qboCustomerId || "",
    phone: patch.phone || o.phone || "",
    email: patch.email || o.email || "",
    billingAddress: patch.billingAddress || o.billingAddress || "",
    serviceAddress: keepServiceAddress ? o.serviceAddress || patch.serviceAddress || "" : o.serviceAddress || "",
    apartment: o.apartment || patch.apartment || "",
  };
}

function PickCustomerJobsSheet({ title, hint, jobs, onClose, onPick, filterOpen }) {
  const [q, setQ] = useState("");
  const [cust, setCust] = useState(null);
  const matches = useMemo(() => {
    if (!cust) return [];
    const key = customerKeyForName(cust.name);
    let list = jobsForCustomerKey(jobs, key);
    if (filterOpen) list = list.filter((j) => !j.paid && openBalance(j) > 0.01);
    return sortJobs(list);
  }, [cust, jobs, filterOpen]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return matches;
    return matches.filter((j) =>
      [j.customer, j.title, j.invoiceNo, j.estimateNo, j.address].some((x) =>
        String(x || "")
          .toLowerCase()
          .includes(needle)
      )
    );
  }, [matches, q]);

  return (
    <Sheet title={title} onClose={onClose}>
      <p className="text-sm text-slate-500 mb-3">{hint}</p>
      <CustomerSearch
        label="Customer"
        testId="addflow-customer-search"
        value={cust?.name || ""}
        onChangeText={() => setCust(null)}
        onPick={(c) => setCust(c && !c._newCustomer ? c : null)}
      />
      {cust ? (
        <>
          <input
            className="input mt-3"
            type="search"
            placeholder="🔍  Search invoices & jobs…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search jobs"
          />
          {filtered.length ? (
            <div className="mt-3 space-y-2">
              {filtered.map((j) => (
                <Opt
                  key={j.id}
                  icon="🧾"
                  title={j.title || j.customer || "Job"}
                  note={
                    (j.invoiceNo ? "Inv #" + j.invoiceNo + " · " : "") +
                    (fmtAmountDue(j) || fmt$(openBalance(j)) || "No balance")
                  }
                  onClick={() => onPick(j)}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400 text-center py-6 mt-3">
              {filterOpen ? "No open invoices for this customer." : "No jobs for this customer yet."}
            </p>
          )}
        </>
      ) : null}
    </Sheet>
  );
}

export default function NewJobFlow() {
  const { newJob, setNewJob, events, markSasHandled, jobs, enqueue, showToast, syncNow, refreshJobs, api } = useStore();
  const nav = useNavigate();
  if (!newJob) return null;
  const close = () => setNewJob(null);
  const context = newJob.context || null;

  if (newJob.step === "choose")
    return (
      <Sheet title="Add" onClose={close}>
        <Opt icon="🔧" title="Add a job" note="New scope for a customer — type details or pick from calendar" onClick={() => setNewJob({ step: "jobMenu", context })} />
        <Opt icon="🏗️" title="Add a job with vendor" note="Track subcontractor / vendor on the job" onClick={() => setNewJob({ step: "form", prefill: {}, context, vendorMode: true })} />
        <Opt icon="🧾" title="Add an invoice" note="Pick customer & job, then build the invoice" onClick={() => setNewJob({ step: "pickInvoice" })} />
        <Opt icon="👤" title="Add a customer" note="One form — live QuickBooks match as you type" onClick={() => setNewJob({ step: "newCustomer" })} />
        <Opt icon="💵" title="Add a payment" note="Find customer & invoice, then record or charge" onClick={() => setNewJob({ step: "pickPayment" })} />
      </Sheet>
    );

  if (newJob.step === "jobMenu")
    return (
      <Sheet title="Add a job" onClose={close}>
        <Opt icon="✍️" title="Enter manually" note="Type the customer & job details" onClick={() => setNewJob({ step: "form", prefill: {}, context })} />
        <Opt
          icon="📅"
          title="Choose from calendar"
          note="Search appointments since Jan 1 — prefill a new job"
          onClick={() => setNewJob({ step: "cal", context })}
        />
        <Opt
          icon="🗓️"
          title="Add an appointment"
          note={
            context
              ? "Book on the calendar — pre-filled from " + (context._customerContext ? "customer" : "this job")
              : "Book on the calendar — see what's already scheduled"
          }
          onClick={() => setNewJob({ step: "appt", context })}
        />
      </Sheet>
    );

  if (newJob.step === "newCustomer")
    return (
      <NewCustomerForm
        onClose={close}
        onCreated={(id, name) => nav("/customer/" + encodeURIComponent(customerKeyForName(name) || id))}
      />
    );

  if (newJob.step === "pickPayment" && newJob.job)
    return <MarkPaidSheet job={newJob.job} onClose={close} />;

  if (newJob.step === "pickPayment")
    return (
      <PickCustomerJobsSheet
        title="Add a payment"
        hint="Pick the customer, then choose the invoice to pay."
        jobs={jobs}
        filterOpen
        onClose={close}
        onPick={(job) => setNewJob({ ...newJob, step: "pickPayment", job })}
      />
    );

  if (newJob.step === "pickInvoice" && newJob.docBuild)
    return (
      <DocBuilderSheet
        job={newJob.job}
        kind="invoice"
        mode={newJob.docBuild.mode || "new"}
        progressPct={newJob.docBuild.progressPct}
        onClose={close}
        onDone={() => {
          close();
          nav("/job/" + encodeURIComponent(newJob.job.id));
        }}
      />
    );

  if (newJob.step === "pickInvoice" && newJob.progressPct)
    return (
      <ProgressPctSheet
        title={newJob.progressTitle}
        hint={newJob.progressHint}
        onClose={close}
        onConfirm={(pct) =>
          setNewJob({
            ...newJob,
            progressPct: null,
            docBuild: { mode: newJob.invoiceMode, progressPct: pct },
          })
        }
      />
    );

  if (newJob.step === "pickInvoice" && newJob.job)
    return (
      <InvoiceCreateSheet
        job={newJob.job}
        onClose={() => setNewJob({ step: "pickInvoice" })}
        onPick={({ mode }) => {
          if (mode === "from_estimate") {
            setNewJob({
              ...newJob,
              progressPct: true,
              progressTitle: "Invoice from estimate",
              progressHint: "What percentage of the estimate should this invoice bill?",
              invoiceMode: "from_estimate",
            });
          } else {
            setNewJob({ ...newJob, docBuild: { mode: "new" } });
          }
        }}
      />
    );

  if (newJob.step === "pickInvoice")
    return (
      <PickCustomerJobsSheet
        title="Add an invoice"
        hint="Pick the customer, then the job to invoice."
        jobs={jobs}
        onClose={close}
        onPick={(job) => setNewJob({ ...newJob, step: "pickInvoice", job })}
      />
    );

  if (newJob.step === "cal") {
    return (
      <CalendarSearchSheet
        events={events}
        title="Choose from calendar"
        hint="Search since Jan 1 — pick an appointment to start a new job from it."
        onClose={close}
        onPick={(e) =>
          setNewJob({
            step: "form",
            prefill: prefillFromEvent(e),
            context,
          })
        }
      />
    );
  }

  if (newJob.step === "appt") {
    return <AddAppointmentSheet job={context} onClose={close} />;
  }

  return (
    <NewJobForm
      key={(newJob.prefill?.calEventId || "new") + ":" + (newJob.prefill?.customer || "manual")}
      prefill={newJob.prefill || {}}
      vendorMode={Boolean(newJob.vendorMode)}
      onClose={close}
      onCreated={(id) => {
        if (newJob.sasCallId) markSasHandled(newJob.sasCallId, { handled: true, jobId: id });
        nav("/job/" + encodeURIComponent(id));
      }}
    />
  );
}

function NewCustomerForm({ onClose, onCreated }) {
  const { createJob, jobs, api, enqueue, showToast, refreshJobs } = useStore();
  const [f, setF] = useState({
    businessName: "",
    personName: "",
    phone: "",
    email: "",
    billingAddress: "",
    serviceAddress: "",
    apartment: "",
    qboCustomerId: "",
  });
  const [baseline, setBaseline] = useState(null);
  const [syncAction, setSyncAction] = useState("update");
  const [qboIndex, setQboIndex] = useState([]);

  const set = (k) => (e) => setF((o) => ({ ...o, [k]: e.target.value }));

  const applyPick = useCallback(
    async (c) => {
      if (!c) return;
      if (c._newCustomer) {
        setBaseline(null);
        setF((o) => ({
          ...o,
          businessName: c.name || "",
          qboCustomerId: "",
        }));
        return;
      }
      const patch = await enrichAndPatchCustomer(c, jobs, api);
      const next = {
        businessName: patch.businessName || patch.customer || "",
        personName: patch.personName || "",
        phone: patch.phone || "",
        email: patch.email || "",
        billingAddress: patch.billingAddress || "",
        serviceAddress: patch.serviceAddress || "",
        apartment: patch.apartment || "",
        qboCustomerId: patch.qboCustomerId || "",
      };
      setF(next);
      setBaseline(snapshotCustomerForm(next));
      setSyncAction("update");
    },
    [api, jobs]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await api.searchCustomers();
        if (!cancelled) setQboIndex(Array.isArray(list) ? list : []);
      } catch {
        if (!cancelled) setQboIndex([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  const formChanged = customerFormDiffersFromBaseline(f, baseline);
  const createDisabled = formChanged && createNewCustomerDisabled(f.businessName, qboIndex);

  const save = async () => {
    const biz = (f.businessName || "").trim();
    if (!biz) {
      showToast("Business name is required");
      return;
    }
    const action = resolveAddCustomerAction({
      baseline,
      matchedQboId: f.qboCustomerId,
      formChanged,
      syncAction,
    });
    if (action === "create" && createDisabled) {
      showToast("That business name already exists in QuickBooks");
      return;
    }

    const id = await createJob({
      businessName: biz,
      personName: f.personName || "",
      customer: biz,
      title: "New customer",
      phone: f.phone || "",
      email: f.email || "",
      billingAddress: f.billingAddress || "",
      serviceAddress: f.serviceAddress || "",
      address: f.serviceAddress || "",
      apartment: f.apartment || "",
      qboCustomerId: action === "create" ? "" : f.qboCustomerId || "",
    });
    if (!id) return;

    const payload = customerSyncPayload({ ...f, businessName: biz, customer: biz });
    if (action === "link" && f.qboCustomerId) {
      const name = biz;
      try {
        sessionStorage.setItem(
          PENDING_IMPORT_LS,
          JSON.stringify({
            key: customerKeyForImport({ id: f.qboCustomerId, name }),
            name,
            qboId: f.qboCustomerId,
            started: Date.now(),
          })
        );
      } catch {}
      await enqueue(
        "import_customer",
        "import-" + f.qboCustomerId,
        { name, qboId: f.qboCustomerId },
        "deterministic",
        "import_customer|" + f.qboCustomerId
      );
      refreshJobs?.(true);
      showToast("Linked to QuickBooks — importing jobs…");
    } else if (action === "update" && f.qboCustomerId) {
      await enqueue(
        "update_customer",
        id,
        { id: f.qboCustomerId, ...payload },
        "deterministic",
        "update_customer|" + id + "|" + Date.now()
      );
      showToast("Saved & syncing update to QuickBooks…");
    } else if (action === "create") {
      await enqueue(
        "create_customer",
        id,
        payload,
        "deterministic",
        "create_customer|" + id + "|" + Date.now()
      );
      showToast("Saved & creating in QuickBooks…");
    }

    onClose();
    onCreated?.(id, biz);
  };

  return (
    <Sheet title="Add customer" onClose={onClose}>
      <Fld label="Business name" hint="Live match on name, phone, email, or billing address">
        <CustomerSearch
          label="Business name"
          testId="newcustomer-search"
          value={f.businessName}
          onChangeText={(v) => setF((o) => ({ ...o, businessName: v }))}
          onPick={applyPick}
        />
      </Fld>
      <Fld label="Person name" hint="Contact person — live QuickBooks match">
        <CustomerLiveMatch
          label="Person name"
          testId="newcustomer-person"
          value={f.personName}
          onChange={(v) => setF((o) => ({ ...o, personName: v }))}
          onPick={applyPick}
        />
      </Fld>
      {CONTACT_FIELDS.map(([k, l]) => (
        <Fld key={k} label={l} hint={k === "phone" ? "Live QuickBooks match" : undefined}>
          {k === "phone" ? (
            <CustomerLiveMatch
              label={l}
              testId="newcustomer-phone"
              value={f.phone}
              onChange={(v) => setF((o) => ({ ...o, phone: v }))}
              onPick={applyPick}
            />
          ) : (
            <input className="input" value={f[k]} onChange={set(k)} aria-label={l} />
          )}
        </Fld>
      ))}
      <Fld label="Billing address" hint="Live QuickBooks match">
        <CustomerLiveMatch
          label="Billing address"
          testId="newcustomer-billing"
          value={f.billingAddress}
          onChange={(v) => setF((o) => ({ ...o, billingAddress: v }))}
          onPick={applyPick}
        />
      </Fld>
      <Fld label="Service address" hint="Default site for future jobs (optional)">
        <input className="input" value={f.serviceAddress} onChange={set("serviceAddress")} aria-label="Service address" />
      </Fld>
      <Fld label="Apartment #">
        <input className="input" value={f.apartment} onChange={set("apartment")} aria-label="Apartment #" />
      </Fld>

      {formChanged ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2 mb-3" data-testid="addcustomer-sync-choice">
          <p className="text-sm text-amber-900">
            Matches an existing QuickBooks customer — you changed a field. Choose what happens on Save &amp; sync:
          </p>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              name="addcust-sync"
              checked={syncAction === "update"}
              onChange={() => setSyncAction("update")}
              data-testid="addcustomer-action-update"
            />
            Update in QuickBooks
          </label>
          <label
            className={"flex items-center gap-2 text-sm " + (createDisabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer")}
          >
            <input
              type="radio"
              name="addcust-sync"
              checked={syncAction === "create"}
              disabled={createDisabled}
              onChange={() => !createDisabled && setSyncAction("create")}
              data-testid="addcustomer-action-create"
            />
            Create new customer
            {createDisabled ? (
              <span className="text-xs text-slate-500">(business name already in QuickBooks)</span>
            ) : null}
          </label>
        </div>
      ) : null}

      <button className="btn-brand w-full" onClick={save} data-testid="addcustomer-save-sync">
        Save &amp; sync
      </button>
    </Sheet>
  );
}

function NewJobForm({ prefill, onClose, onCreated, vendorMode = false }) {
  const { createJob, jobs, api } = useStore();
  const [f, setF] = useState(() => {
    const o = { date: prefill.date || "", title: prefill.title || "", description: prefill.description || "" };
    CONTACT_FIELDS.forEach(([k]) => (o[k] = prefill[k] || ""));
    o.businessName = prefill.businessName || prefill.customer || "";
    o.personName = prefill.personName || "";
    o.customer = o.businessName;
    o.serviceAddress = prefill.serviceAddress || prefill.address || "";
    o.apartment = prefill.apartment || "";
    o.billingAddress = prefill.billingAddress || "";
    o.qboCustomerId = prefill.qboCustomerId || "";
    o.invoiceNo = "";
    o.estimateNo = "";
    o.vendor = prefill.vendor || "";
    return o;
  });
  const [titlePick, setTitlePick] = useState("new");
  const autoFilledRef = useRef("");
  const fRef = useRef(f);
  fRef.current = f;

  const titleOptions = useMemo(
    () =>
      f.qboCustomerId || f.businessName
        ? openDocsForCustomer({ id: f.qboCustomerId, name: f.businessName || f.customer }, jobs)
        : [],
    [f.qboCustomerId, f.businessName, f.customer, jobs]
  );

  const applyCustomer = useCallback(
    async (customer, { keepServiceAddress = true } = {}) => {
      const patch = await enrichAndPatchCustomer(customer, jobs, api);
      setTitlePick("new");
      setF((o) => mergeCustomerPatch(o, patch, { keepServiceAddress }));
    },
    [api, jobs]
  );

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
        if (!match || cancelled) return;
        autoFilledRef.current = token;
        const patch = await enrichAndPatchCustomer(match, jobs, api);
        if (cancelled) return;
        setTitlePick("new");
        setF((o) => mergeCustomerPatch(o, patch, { keepServiceAddress: true }));
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
    if (c && c._newCustomer) {
      setTitlePick("new");
      setF((o) => ({
        ...o,
        businessName: c.name || "",
        customer: c.name || "",
        qboCustomerId: "",
      }));
      return;
    }
    applyCustomer(c, { keepServiceAddress: true });
  };

  const onTitlePick = (e) => {
    const v = e.target.value;
    setTitlePick(v);
    if (v === "new") {
      setF((o) => ({ ...o, invoiceNo: "", estimateNo: "" }));
      return;
    }
    const doc = titleOptions.find((d) => `${d.kind}:${d.no}` === v);
    if (!doc) return;
    setF((o) => ({
      ...o,
      title: doc.title || doc.label,
      invoiceNo: doc.kind === "invoice" ? doc.no : "",
      estimateNo: doc.kind === "estimate" ? doc.no : "",
      serviceAddress: o.serviceAddress || doc.serviceAddress || "",
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
      invoiceNo: cur.invoiceNo || "",
      estimateNo: cur.estimateNo || "",
      date: cur.date,
      qboCustomerId: cur.qboCustomerId,
      description: cur.description || (cur.vendor ? "Vendor: " + cur.vendor : ""),
    };
    const id = await createJob(payload, prefill.calEventId || "");
    if (id) {
      onClose();
      onCreated && onCreated(id);
    }
  };

  return (
    <Sheet title={vendorMode ? "New job with vendor" : "New job — details"} onClose={onClose}>
      <Fld label="Business name" hint="Search existing QuickBooks customers, or add a new one">
        <CustomerSearch
          label="Business name"
          testId="newjob-business-name"
          value={f.businessName || f.customer}
          onChangeText={(v) => {
            setTitlePick("new");
            setF((o) => ({ ...o, businessName: v, customer: v, qboCustomerId: "", invoiceNo: "", estimateNo: "" }));
          }}
          onPick={pickCustomer}
        />
      </Fld>
      <Fld label="Person name" hint="Contact person from QuickBooks (optional)">
        <input className="input" value={f.personName} onChange={set("personName")} aria-label="Person name" />
      </Fld>

      <Fld
        label="Job title / scope"
        hint={
          titleOptions.length
            ? "Pick an open invoice or estimate for this customer, or add a new scope"
            : "What we're doing on this visit"
        }
      >
        {titleOptions.length > 0 && (
          <select
            className="input mb-2"
            value={titlePick}
            onChange={onTitlePick}
            aria-label="Job title — open invoices and estimates"
            data-testid="newjob-title-picker"
          >
            <option value="new">＋ New scope (type below)</option>
            {titleOptions.map((d) => (
              <option key={d.kind + ":" + d.no} value={`${d.kind}:${d.no}`}>
                {d.label}
              </option>
            ))}
          </select>
        )}
        <input className="input" value={f.title} onChange={set("title")} aria-label="Job title / scope" />
      </Fld>
      {vendorMode ? (
        <Fld label="Vendor / subcontractor" hint="Who you're working with on this job">
          <input className="input" value={f.vendor} onChange={set("vendor")} aria-label="Vendor" />
        </Fld>
      ) : null}
      <Fld label="Description" hint="From calendar (apt/unit parsed out to Apartment # field)">
        <textarea
          className="input min-h-[60px]"
          value={f.description}
          onChange={set("description")}
          aria-label="Description"
        />
      </Fld>
      {CONTACT_FIELDS.map(([k, l]) => (
        <Fld key={k} label={l}>
          <input className="input" value={f[k]} onChange={set(k)} aria-label={l} />
        </Fld>
      ))}
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

      <Fld label="Scheduled date">
        <input className="input" type="date" value={f.date} onChange={set("date")} aria-label="Scheduled date" />
      </Fld>
      <button className="btn-brand w-full" onClick={create}>
        Create job
      </button>
    </Sheet>
  );
}