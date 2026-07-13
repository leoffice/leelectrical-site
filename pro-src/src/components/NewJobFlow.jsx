// + FAB flow: manual form, searchable calendar pick, or add appointment.
import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Sheet, { Fld, Opt } from "./Sheet.jsx";
import CustomerSearch from "./CustomerSearch.jsx";
import CustomerLiveMatch from "./CustomerLiveMatch.jsx";
import SubCompanySection from "./SubCompanySection.jsx";
import DescriptionField from "./DescriptionField.jsx";
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
import {
  parentCustomerPatch,
  serviceAddressesForJobs,
  subsForParentQboId,
} from "../lib/customerHierarchy.js";
import { MarkPaidSheet, PaymentIntroSheet } from "./JobSheets.jsx";
import DocBuilderSheet from "./DocBuilderSheet.jsx";
import { fmt$ } from "../lib/format.js";
import { sortJobs } from "../lib/stages.js";
import { serviceAddressHint, serviceAddressLabel, customerSyncPayload } from "../lib/customerSync.js";
import { enqueueCustomerQboSync } from "../lib/customerQboEnqueue.js";
import {
  createNewCustomerDisabled,
  customerFormDiffersFromBaseline,
  resolveAddCustomerAction,
  snapshotCustomerForm,
} from "../lib/addCustomerFlow.js";
import { prefillFromEvent } from "../lib/prefillFromEvent.js";
import AddressAutocompleteField from "./AddressAutocompleteField.jsx";
import { draftJobFromFabContext, paymentFabStep } from "../lib/fabPrefill.js";

export { prefillFromEvent };

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
    parentCustomerName: patch.parentCustomerName || o.parentCustomerName || "",
    parentQboCustomerId: patch.parentQboCustomerId || o.parentQboCustomerId || "",
  };
}

function PickCustomerJobsSheet({ title, hint, jobs, onClose, onPick, filterOpen, initialCustomerName = "" }) {
  const [q, setQ] = useState("");
  const [cust, setCust] = useState(initialCustomerName ? { name: initialCustomerName } : null);
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
        <Opt
          icon="🧾"
          title="Add an invoice"
          note={context ? "Pre-filled from this page — edit anything" : "Full invoice builder — customer on top, pick address & lines"}
          onClick={() =>
            setNewJob({
              step: "pickInvoice",
              draftJob: draftJobFromFabContext(context),
              job: context?.id && !context?._customerContext ? context : null,
              context,
            })
          }
        />
        <Opt icon="👤" title="Add a customer" note="One form — live QuickBooks match as you type" onClick={() => setNewJob({ step: "newCustomer" })} />
        <Opt
          icon="💵"
          title="Add a payment"
          note={context ? "Pre-filled from this page — attach a picture or pick type" : "Attach a picture or pick payment type"}
          onClick={() => {
            const next = paymentFabStep(context, jobs);
            setNewJob({
              step: "paymentIntro",
              context,
              jobHint: next.job || null,
              paymentPrefill: next.customerName ? { customerName: next.customerName } : undefined,
            });
          }}
        />
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
        prefill={newJob.prefill || {}}
        onClose={close}
        onCreated={(id, name) => nav("/customer/" + encodeURIComponent(customerKeyForName(name) || id))}
      />
    );

  const resolvePaymentJob = (flow) => {
    if (flow.jobHint) return flow.jobHint;
    const ctx = flow.context;
    if (ctx?.id && !ctx?._customerContext && ctx?.invoiceNo) return ctx;
    return flow.job || null;
  };

  if (newJob.step === "paymentIntro")
    return (
      <PaymentIntroSheet
        onClose={close}
        onAttachPicture={() =>
          setNewJob({
            ...newJob,
            step: "pickPayment",
            job: resolvePaymentJob(newJob),
            openProofPicker: true,
            initialMethod: "Check",
          })
        }
        onPickMethod={(method) =>
          setNewJob({
            ...newJob,
            step: "pickPayment",
            job: resolvePaymentJob(newJob),
            initialMethod: method,
          })
        }
      />
    );

  if (newJob.step === "pickPayment")
    return (
      <MarkPaidSheet
        job={newJob.job || null}
        initialCustomerName={newJob.paymentPrefill?.customerName || ""}
        initialMethod={newJob.initialMethod || ""}
        openProofPicker={Boolean(newJob.openProofPicker)}
        onClose={close}
      />
    );

  if (newJob.step === "pickInvoice")
    return (
      <DocBuilderSheet
        job={
          newJob.job ||
          newJob.draftJob || {
            customer: "",
            businessName: "",
            personName: "",
            phone: "",
            email: "",
            billingAddress: "",
            title: "",
            serviceAddress: "",
            address: "",
          }
        }
        kind="invoice"
        mode="create"
        editableCustomer
        draftMode={!newJob.job?.id}
        allJobs={jobs}
        onCustomerPatch={(draftJob) => setNewJob((o) => ({ ...o, draftJob }))}
        onClose={close}
        onDone={(saved) => {
          const j = saved || newJob.job || newJob.draftJob;
          close();
          if (j?.id) nav("/job/" + encodeURIComponent(j.id));
        }}
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

function NewCustomerForm({ prefill = {}, onClose, onCreated }) {
  const { createJob, jobs, events, api, enqueue, showToast, refreshJobs } = useStore();
  const [f, setF] = useState(() => ({
    businessName: prefill.businessName || prefill.customer || "",
    personName: prefill.personName || "",
    phone: prefill.phone || "",
    email: prefill.email || "",
    billingAddress: prefill.billingAddress || "",
    serviceAddress: prefill.serviceAddress || prefill.address || "",
    apartment: prefill.apartment || "",
    qboCustomerId: prefill.qboCustomerId || "",
    parentCustomerName: prefill.parentCustomerName || "",
    parentQboCustomerId: prefill.parentQboCustomerId || "",
  }));
  const [baseline, setBaseline] = useState(null);
  const [syncAction, setSyncAction] = useState("update");
  const [qboIndex, setQboIndex] = useState([]);
  const [isSubCompany, setIsSubCompany] = useState(
    () => !!(String(prefill.parentCustomerName || "").trim() || String(prefill.parentQboCustomerId || "").trim())
  );

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
      showToast("Customer name is required");
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
      parentCustomerName: f.parentCustomerName || "",
      parentQboCustomerId: f.parentQboCustomerId || "",
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

  const pickParentCo = useCallback(
    async (c) => {
      if (!c) return;
      if (c._newCustomer) {
        setF((o) => ({ ...o, parentCustomerName: c.name || "", parentQboCustomerId: "" }));
        return;
      }
      const patch = await enrichAndPatchCustomer(c, jobs, api);
      setF((o) => ({ ...o, ...parentCustomerPatch({ ...c, ...patch, id: patch.qboCustomerId || c.id }) }));
    },
    [api, jobs]
  );

  const toggleSubCompany = (next) => {
    setIsSubCompany(next);
    if (!next) setF((o) => ({ ...o, parentCustomerName: "", parentQboCustomerId: "" }));
  };

  return (
    <Sheet title="Add customer" onClose={onClose}>
      <Fld label="Customer name" hint="Billing entity — live match on name, phone, email, or billing address">
        <CustomerSearch
          label="Customer name"
          testId="newcustomer-search"
          value={f.businessName}
          onChangeText={(v) => setF((o) => ({ ...o, businessName: v }))}
          onPick={applyPick}
        />
      </Fld>
      <SubCompanySection
        testId="newcustomer"
        on={isSubCompany}
        onToggle={toggleSubCompany}
        parentName={f.parentCustomerName}
        onParentNameChange={(v) => setF((o) => ({ ...o, parentCustomerName: v, parentQboCustomerId: "" }))}
        onParentPick={pickParentCo}
      />
      <Fld label="Person name" hint="Contact person — live QuickBooks match">
        <CustomerLiveMatch
          label="Person name"
          testId="newcustomer-person"
          value={f.personName}
          onChange={(v) => setF((o) => ({ ...o, personName: v }))}
          onPick={applyPick}
          showNewCustomer={false}
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
              showNewCustomer={false}
            />
          ) : (
            <input className="input" value={f[k]} onChange={set(k)} aria-label={l} />
          )}
        </Fld>
      ))}
      <Fld label="Billing address" hint="Search real addresses as you type — tap one to fill">
        <AddressAutocompleteField
          label="Billing address"
          value={f.billingAddress}
          onChange={(v) => setF((o) => ({ ...o, billingAddress: v }))}
          jobs={jobs}
          events={events}
          suggestAddresses={api.suggestAddresses?.bind(api)}
          testId="newcustomer-billing"
          ariaLabel="Billing address"
        />
      </Fld>
      <Fld label="Service address" hint="Default site for future jobs — partial address OK">
        <AddressAutocompleteField
          label="Service address"
          value={f.serviceAddress}
          onChange={(v) => setF((o) => ({ ...o, serviceAddress: v }))}
          jobs={jobs}
          events={events}
          suggestAddresses={api.suggestAddresses?.bind(api)}
          testId="newcustomer-service"
          ariaLabel="Service address"
        />
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
            Update in QB
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
              <span className="text-xs text-slate-500">(business name already in QB)</span>
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
  const { createJob, jobs, events, api, enqueue } = useStore();
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
    o.parentCustomerName = prefill.parentCustomerName || "";
    o.parentQboCustomerId = prefill.parentQboCustomerId || "";
    o.invoiceNo = "";
    o.estimateNo = "";
    o.vendor = prefill.vendor || "";
    return o;
  });
  const [titlePick, setTitlePick] = useState("new");
  const [subPick, setSubPick] = useState("");
  const [addrPick, setAddrPick] = useState("");
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

  const parentSubs = useMemo(() => {
    const qid = String(f.qboCustomerId || "").trim();
    if (!qid) return [];
    return subsForParentQboId(jobs, qid);
  }, [f.qboCustomerId, jobs]);

  const addressChoices = useMemo(() => {
    const ck =
      (f.qboCustomerId && "q:" + f.qboCustomerId) ||
      customerKeyForName(f.businessName || f.customer);
    if (!ck) return [];
    return serviceAddressesForJobs(jobsForCustomerKey(jobs, ck));
  }, [f.qboCustomerId, f.businessName, f.customer, jobs]);

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

  const applySub = (sub) => {
    const j = sub.jobs[0];
    if (!j) return;
    setSubPick(sub.key);
    setF((o) => ({
      ...o,
      businessName: j.businessName || j.customer || "",
      customer: j.businessName || j.customer || "",
      personName: j.personName || "",
      phone: j.phone || "",
      email: j.email || "",
      billingAddress: j.billingAddress || "",
      qboCustomerId: j.qboCustomerId || "",
      parentCustomerName: j.parentCustomerName || o.parentCustomerName || "",
      parentQboCustomerId: j.parentQboCustomerId || o.parentQboCustomerId || "",
    }));
  };

  const pickCustomer = (c) => {
    setSubPick("");
    if (c && c._newCustomer) {
      setTitlePick("new");
      setF((o) => ({
        ...o,
        businessName: c.name || "",
        customer: c.name || "",
        qboCustomerId: "",
        parentCustomerName: "",
        parentQboCustomerId: "",
      }));
      return;
    }
    if (c.parentId) {
      setF((o) => ({
        ...o,
        ...parentCustomerPatch({ id: c.parentId, name: c.parentName || "" }),
      }));
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
      parentCustomerName: cur.parentCustomerName || "",
      parentQboCustomerId: cur.parentQboCustomerId || "",
      description: cur.description || (cur.vendor ? "Vendor: " + cur.vendor : ""),
    };
    const id = await createJob(payload, prefill.calEventId || "");
    if (id) {
      if (!cur.qboCustomerId && (cur.businessName || cur.customer)) {
        enqueueCustomerQboSync(enqueue, id, payload, "");
      }
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

      {parentSubs.length > 1 ? (
        <Fld label="Bill to which company?" hint="This management company has multiple billing entities">
          <select
            className="input"
            value={subPick}
            onChange={(e) => {
              const sk = e.target.value;
              setSubPick(sk);
              const sub = parentSubs.find((s) => s.key === sk);
              if (sub) applySub(sub);
            }}
            aria-label="Sub-company"
            data-testid="newjob-sub-picker"
          >
            <option value="">Choose billing entity…</option>
            {parentSubs.map((s) => (
              <option key={s.key} value={s.key}>
                {s.name}
              </option>
            ))}
          </select>
        </Fld>
      ) : null}

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
      <DescriptionField
        label="Description"
        hint="From calendar (apt/unit parsed out to Apartment # field)"
        multiline
        value={f.description}
        onChange={(v) => setF((o) => ({ ...o, description: v }))}
        context={{ jobTitle: f.title, address: f.serviceAddress || f.address }}
        testId="newjob-description"
        ariaLabel="Description"
      />
      {CONTACT_FIELDS.map(([k, l]) => (
        <Fld key={k} label={l}>
          <input className="input" value={f[k]} onChange={set(k)} aria-label={l} />
        </Fld>
      ))}
      <Fld label="Billing address" hint="Partial address OK — tap a suggestion to complete">
        <AddressAutocompleteField
          label="Billing address"
          value={f.billingAddress}
          onChange={(v) => setF((o) => ({ ...o, billingAddress: v }))}
          jobs={jobs}
          events={events}
          suggestAddresses={api.suggestAddresses?.bind(api)}
          testId="newjob-billing"
          ariaLabel="Billing address"
        />
      </Fld>

      {addressChoices.length > 1 ? (
        <Fld label="Service address" hint="Pick an existing site or type a new one below">
          <select
            className="input mb-2"
            value={addrPick}
            onChange={(e) => {
              const v = e.target.value;
              setAddrPick(v);
              if (v === "new") return;
              const hit = addressChoices.find((a) => a.key === v);
              if (hit) setF((o) => ({ ...o, serviceAddress: hit.label }));
            }}
            aria-label="Service address picker"
            data-testid="newjob-address-picker"
          >
            <option value="">Choose address…</option>
            {addressChoices.map((a) => (
              <option key={a.key} value={a.key}>
                {a.label}
              </option>
            ))}
            <option value="new">＋ New address</option>
          </select>
        </Fld>
      ) : null}
      <Fld label={serviceAddressLabel(f)} hint={serviceAddressHint(f) + " — partial address OK"}>
        <AddressAutocompleteField
          label={serviceAddressLabel(f)}
          value={f.serviceAddress}
          onChange={(v) => {
            setAddrPick("");
            setF((o) => ({ ...o, serviceAddress: v }));
          }}
          jobs={jobs}
          events={events}
          suggestAddresses={api.suggestAddresses?.bind(api)}
          testId="newjob-service"
          ariaLabel={serviceAddressLabel(f)}
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