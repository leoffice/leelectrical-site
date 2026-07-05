// SAS answering-service lead tickets — pure helpers for the Calls tab.
// A "call" is { id, receivedAt, data: {...flexible SAS webhook fields} }.
// Field names vary per SAS script, so every extractor is tolerant.
// IMPORTANT: these are LEADS, not QuickBooks customers — nothing in this
// module (or the Calls tab) may enqueue QBO commands.

const s = (v) => (v == null ? "" : String(v).trim());
const d = (call) => (call && call.data) || {};

export function callName(call) {
  const o = d(call);
  const first = s(o.caller_first || o.first_name || o.first);
  const last = s(o.caller_last || o.last_name || o.last);
  return s(o.caller_name || o.name) || [first, last].filter(Boolean).join(" ") || "Unknown caller";
}

export function callPhone(call) {
  const o = d(call);
  return s(
    o.phone ||
      o.phone_number ||
      o.main_phone ||
      o.cell_phone ||
      o.caller_id ||
      o.home_phone ||
      o.business_phone ||
      o.alt_phone ||
      o.callback_phone ||
      o.transfer_number
  );
}

export function callEmail(call) {
  const o = d(call);
  return s(o.email || o.caller_email || o.email_address);
}

export function callAddress(call) {
  const o = d(call);
  if (s(o.address)) return s(o.address);
  return [o.street || o.address1 || o.address_1, o.address2 || o.address_2, o.city, o.state, o.zip || o.zipcode]
    .map(s)
    .filter(Boolean)
    .join(", ");
}

export function callMessage(call) {
  const o = d(call);
  return s(o.ticket_message || o.message || o.non_message_call || o.reason || o.agent_notes || o.additional_info);
}

/** Short badge text: outcome / booking / service — whatever the script sent. */
export function callType(call) {
  const o = d(call);
  return s(o.call_outcome || o.call_type || o.service_name || o.booking || o.booking_made || o.script_name);
}

/** Epoch ms for sorting + "Xm ago" — receivedAt first, session_start fallback. */
export function callWhen(call) {
  const t = Date.parse((call && call.receivedAt) || "");
  if (!isNaN(t)) return t;
  const t2 = Date.parse(s(d(call).session_start));
  return isNaN(t2) ? 0 : t2;
}

export function callAppointment(call) {
  const o = d(call);
  return [s(o.appointment_date), s(o.appointment_time)].filter(Boolean).join(" ");
}

/** "07/06/2026" (SAS style) -> "2026-07-06" for <input type=date>. */
export function isoDate(us) {
  const m = s(us).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : "";
}

export function isHandled(tickets, callId) {
  const t = tickets && tickets[callId];
  return !!(t && t.handled);
}

export function unhandledCount(calls, tickets) {
  return (calls || []).filter((c) => c && c.id && !isHandled(tickets, c.id)).length;
}

/** Prefill for the EXISTING new-job flow (NewJobFlow form) — stage Lead comes
 *  from createJob itself. Customer/phone/email/address/title from the call. */
export function prefillFromCall(call) {
  const o = d(call);
  const name = callName(call);
  const msg = callMessage(call);
  return {
    customer: name === "Unknown caller" ? "" : name,
    phone: callPhone(call),
    email: callEmail(call),
    address: callAddress(call),
    title: s(o.service_name) || s(o.booking) || (msg ? msg.slice(0, 60) : "Service call"),
    date: isoDate(o.appointment_date),
  };
}
