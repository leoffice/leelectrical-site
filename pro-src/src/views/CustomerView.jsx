// Customer detail view — opened by tapping a customer group's name header in
// the Jobs list (route /customer/:key, key = URL-encoded group key).
// Shows the customer's contact info, total balance due and open-invoice count,
// then a compact list of all their jobs/open invoices (stage pill, amount,
// paid pill). Tapping a row opens the job in detail WITHOUT leaving the app;
// JobDetail shows a "‹ <customer>" breadcrumb back here (via ?from=).
import React, { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useStore } from "../state/store.jsx";
import { PaidPill, StagePill } from "../components/JobCard.jsx";
import { fmt$ } from "../lib/format.js";
import { sortJobs } from "../lib/stages.js";
import {
  customerContact,
  jobsForCustomerKey,
  openBalance,
  totalBalanceDue,
} from "../lib/customers.js";

export default function CustomerView() {
  const { key: raw } = useParams();
  const nav = useNavigate();
  const { jobs, loading } = useStore();
  const key = raw ? decodeURIComponent(raw) : "";

  const list = useMemo(() => sortJobs(jobsForCustomerKey(jobs, key)), [jobs, key]);
  const contact = useMemo(() => customerContact(list), [list]);
  const due = useMemo(() => totalBalanceDue(list), [list]);
  const openCount = useMemo(() => list.filter((j) => !j.paid).length, [list]);

  if (!list.length) {
    return (
      <div className="card px-6 py-12 text-center text-slate-400 text-sm">
        {loading ? "Loading…" : (
          <>No jobs for this customer. <Link className="text-brand font-semibold" to="/">Back to jobs</Link></>
        )}
      </div>
    );
  }

  const displayName = contact.businessName || contact.name;
  const contactRows = [
    ...(contact.businessName && contact.businessName !== displayName
      ? [["Business", contact.businessName, ""]]
      : []),
    ["Person", contact.personName, ""],
    ["Phone", contact.phone, contact.phone ? `tel:${contact.phone}` : ""],
    ["Email", contact.email, contact.email ? `mailto:${contact.email}` : ""],
    ["Billing address", contact.billingAddress, ""],
  ].filter(([, v]) => v);

  return (
    <div className="space-y-3.5" data-testid="customer-view">
      <button
        className="inline-flex items-center gap-1 text-sm font-semibold text-brand"
        onClick={() => nav("/")}
      >
        ‹ Jobs
      </button>

      {/* Header card: name, contact, total due, open count */}
      <div className="card px-4 py-4">
        <div className="flex items-start gap-3">
          <span className="grid place-items-center w-11 h-11 rounded-2xl bg-accent-soft text-accent font-bold text-lg shrink-0">
            {(contact.name || "?").trim().slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-extrabold text-lg text-slate-900 leading-tight truncate">
              {displayName || "(no customer)"}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              {list.length} job{list.length > 1 ? "s" : ""} · {openCount} open invoice{openCount === 1 ? "" : "s"}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total due</div>
            <div className="font-extrabold text-lg text-slate-900" data-testid="customer-total-due">
              {fmt$(due) || "$0"}
            </div>
          </div>
        </div>

        {contactRows.length > 0 && (
          <dl className="mt-3.5 space-y-1 text-sm">
            {contactRows.map(([k, v, href]) => (
              <div key={k} className="flex gap-2 items-baseline">
                <dt className="font-semibold text-slate-800 shrink-0 w-16">{k}</dt>
                <dd className="text-slate-500 break-words min-w-0">
                  {href ? (
                    <a href={href} className="text-brand font-semibold">{v}</a>
                  ) : (
                    v
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}

        <div className="flex gap-2 mt-3.5">
          <a
            className={`btn flex-1 !py-2 text-center ${contact.phone ? "bg-brand-soft text-brand" : "bg-slate-50 text-slate-300 pointer-events-none"}`}
            href={contact.phone ? `tel:${contact.phone}` : undefined}
          >
            📞 Call
          </a>
          <a
            className={`btn flex-1 !py-2 text-center ${contact.phone ? "bg-brand-soft text-brand" : "bg-slate-50 text-slate-300 pointer-events-none"}`}
            href={contact.phone ? `sms:${contact.phone}` : undefined}
          >
            💬 Text
          </a>
          <a
            className={`btn flex-1 !py-2 text-center ${contact.email ? "bg-brand-soft text-brand" : "bg-slate-50 text-slate-300 pointer-events-none"}`}
            href={contact.email ? `mailto:${contact.email}` : undefined}
          >
            ✉️ Email
          </a>
        </div>
      </div>

      {/* Jobs / open invoices — compact rows; tap switches into a job */}
      <h2 className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider px-1 !mb-[-6px]">
        Jobs &amp; open invoices
      </h2>
      <div className="card divide-y divide-slate-100 overflow-hidden">
        {list.map((j) => (
          <button
            key={j.id}
            className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-slate-50"
            data-testid="customer-job-row"
            onClick={() => nav("/job/" + j.id + "?from=" + encodeURIComponent(key))}
          >
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-sm text-slate-800 truncate">
                {j.title || (j.invoiceNo ? "Invoice #" + j.invoiceNo : "Job")}
              </div>
              <div className="mt-1 flex gap-1.5 flex-wrap">
                <StagePill job={j} />
                <PaidPill job={j} />
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="font-extrabold text-slate-900 text-sm">{fmt$(j.amount) || "—"}</div>
              {!j.paid && openBalance(j) > 0 && (
                <div className="text-[11px] text-slate-400">{fmt$(openBalance(j))} due</div>
              )}
            </div>
            <span className="text-slate-300 shrink-0">›</span>
          </button>
        ))}
      </div>
    </div>
  );
}
