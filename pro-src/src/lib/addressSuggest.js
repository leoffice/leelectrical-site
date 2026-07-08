// Address candidates for calendar location — tap to confirm.
import { jobsForCustomerKey, clientKey } from "./customers.js";
import { calendarServiceLocation, effectiveServiceAddress } from "./customerSync.js";
import { displayEventNotes, jobIdFromEventDescription } from "./calendarLink.js";

export function addressCandidatesForJob(job, jobs = [], events = []) {
  const out = [];
  const seen = new Set();
  const add = (label, value) => {
    const v = String(value || "").trim();
    if (!v) return;
    const key = v.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ label, value: v });
  };

  const j = job || {};
  add("Service address", effectiveServiceAddress(j));
  add("Full address (calendar)", calendarServiceLocation(j));
  add("Billing address", j.billingAddress);
  if (j.apartment) add("Apartment", `${effectiveServiceAddress(j)}, Apt ${j.apartment}`);

  const key = clientKey(j);
  for (const other of jobsForCustomerKey(jobs, key)) {
    if (other.id === j.id) continue;
    const hint = other.title || other.invoiceNo || other.estimateNo || "Other job";
    add(`Service — ${hint}`, effectiveServiceAddress(other));
    add(`Calendar — ${hint}`, calendarServiceLocation(other));
  }

  const cust = (j.businessName || j.customer || "").trim().toLowerCase();
  for (const ev of events || []) {
    const loc = String(ev.location || "").trim();
    if (!loc) continue;
    const summary = String(ev.summary || "").toLowerCase();
    const notes = displayEventNotes(ev.description).toLowerCase();
    const tagged = jobIdFromEventDescription(ev.description) === String(j.id);
    if (tagged || (cust && (summary.includes(cust) || notes.includes(cust)))) {
      add("From calendar", loc);
    }
  }

  return out;
}

export function filterAddressCandidates(candidates, query) {
  const list = candidates || [];
  const q = String(query || "").trim().toLowerCase();
  if (!q) return list;
  return list.filter(
    (c) => c.value.toLowerCase().includes(q) || c.label.toLowerCase().includes(q)
  );
}