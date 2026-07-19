// In-app customer email / text compose — mood-based drafts.
import { EMAIL_MOODS } from "./appointmentActions.js";
import { fmtAmountDue, invoiceTotal, openBalance } from "./customers.js";
import { fmt$ } from "./format.js";
import { activeTenantConfig } from "./tenantBranding.js";

export { EMAIL_MOODS };

function firstName(customer) {
  return (customer || "").trim().split(/\s+/)[0] || "there";
}

/**
 * Short trading name for prose and sign-offs. Deliberately NOT tenantSignOff()
 * / tenantName(), which carry the legal name ("… Inc.") used on documents —
 * customer email and SMS copy has always used the short form.
 */
function brand() {
  return activeTenantConfig().profile?.shortName || "";
}

function sign(channel) {
  return channel === "sms" ? `— ${brand()}` : `— ${brand()}`;
}

/** Regex escape so a tenant website with dots can't act as a wildcard. */
function escapeRe(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Shorten email body for SMS (first lines + optional link). */
export function emailToSms(text, extra) {
  // Drop the email footer lines — sign-off, thanks, and the website line,
  // whose text is per-tenant so it has to be matched dynamically.
  const site = activeTenantConfig().profile?.website || "";
  const siteRe = site ? new RegExp("^" + escapeRe(site), "i") : null;
  const base = String(text || "")
    .split("\n")
    .filter(
      (ln) =>
        ln.trim() && !/^thank you|^—/i.test(ln.trim()) && !(siteRe && siteRe.test(ln.trim()))
    )
    .slice(0, 4)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const tail = extra ? " " + extra : "";
  const out = (base + tail).trim();
  return out.length > 320 ? out.slice(0, 317) + "…" : out;
}

const GENERAL = {
  email: {
    professional: (n, title) =>
      `Dear ${n},\n\nThank you for choosing ${brand()} for ${title}. Please let us know if you have any questions.\n\n${sign("email")}`,
    friendly: (n, title) =>
      `Hi ${n}! 😊\n\nJust checking in about ${title}. We're here if you need anything!\n\n${sign("email")}`,
    direct: (n, title) =>
      `Hi ${n},\n\nFollowing up on ${title}. Reply with any questions or to confirm next steps.\n\n${sign("email")}`,
    casual: (n, title) =>
      `Hey ${n}!\n\nQuick ping about ${title} — we're around if you need us. No pressure, just didn't want you wondering. ⚡\n\n${sign("email")}`,
    urgent: (n, title) =>
      `Hi ${n},\n\nWe need to hear back on ${title} to keep your spot on the schedule. Please reply today.\n\n${sign("email")}`,
  },
  sms: {
    professional: (n, title) => `Hi ${n}, ${brand()} re: ${title}. Questions? Call or reply here. ${sign("sms")}`,
    friendly: (n, title) => `Hi ${n}! 😊 ${brand()} checking in on ${title}. We're here if you need us! ${sign("sms")}`,
    direct: (n, title) => `Hi ${n}, following up on ${title}. Reply with questions or to confirm. ${sign("sms")}`,
    casual: (n, title) => `Hey ${n}! ${brand()} here — still good on ${title}? Holler if you need anything. ⚡ ${sign("sms")}`,
    urgent: (n, title) => `Hi ${n}, need your reply on ${title} today to hold your schedule. — ${brand()}`,
  },
};

const PAYMENT = {
  email: {
    professional: (n, inv, due, url) =>
      `Dear ${n},\n\nThis is a reminder regarding invoice #${inv} (${due} due). Pay securely online:\n${url || "(link)"}\n\n${sign("email")}`,
    friendly: (n, inv, due, url) =>
      `Hi ${n}! Hope you're well. Friendly nudge on invoice #${inv} (${due}). Pay here when ready:\n${url || "(link)"}\n\n${sign("email")}`,
    direct: (n, inv, due, url) =>
      `Hi ${n},\n\nInvoice #${inv} — ${due} outstanding. Pay online:\n${url || "(link)"}\n\n${sign("email")}`,
    casual: (n, inv, due, url) =>
      `Hey ${n} — invoice #${inv} (${due}) is doing the polite tap-tap. 😄 Pay here:\n${url || "(link)"}\n\n${sign("email")}`,
    urgent: (n, inv, due, url) =>
      `Hi ${n},\n\nInvoice #${inv} (${due}) is past due. Please pay today:\n${url || "(link)"}\n\n${sign("email")}`,
  },
  sms: {
    professional: (n, inv, due, url) => `Hi ${n}, invoice #${inv} (${due}) from ${brand()}. Pay: ${url || ""} ${sign("sms")}`,
    friendly: (n, inv, due, url) => `Hi ${n}! Friendly nudge — invoice #${inv} (${due}). Pay: ${url || ""} ${sign("sms")}`,
    direct: (n, inv, due, url) => `Hi ${n}, invoice #${inv} ${due} due. Pay: ${url || ""} ${sign("sms")}`,
    casual: (n, inv, due, url) => `Hey ${n}, invoice #${inv} (${due}) 👋 Pay: ${url || ""} ${sign("sms")}`,
    urgent: (n, inv, due, url) => `Hi ${n}, invoice #${inv} (${due}) past due — please pay today: ${url || ""} ${sign("sms")}`,
  },
};

const REMINDER = {
  email: {
    professional: (n, title, inv) =>
      `Dear ${n},\n\nThis is a courteous reminder regarding ${title}${inv ? " (invoice #" + inv + ")" : ""}. Please let us know if you have questions.\n\n${sign("email")}`,
    friendly: (n, title, inv) =>
      `Hi ${n}! Hope you're doing well. Just a friendly nudge on ${title}${inv ? " — invoice #" + inv : ""}. 😊\n\n${sign("email")}`,
    direct: (n, title, inv) =>
      `Hi ${n},\n\nFollowing up on ${title}${inv ? " (invoice #" + inv + ")" : ""}. Please reply or arrange payment.\n\n${sign("email")}`,
    casual: (n, title, inv) =>
      `Hey ${n} — ${title}${inv ? " (#" + inv + ")" : ""} is still on the radar. Let us know! 😄\n\n${sign("email")}`,
    urgent: (n, title, inv) =>
      `Hi ${n},\n\nWe need to resolve ${title}${inv ? " (invoice #" + inv + ")" : ""} promptly. Please reply today.\n\n${sign("email")}`,
  },
  sms: {
    professional: (n, title, inv) => `Hi ${n}, reminder re: ${title}${inv ? " inv #" + inv : ""}. — ${brand()}`,
    friendly: (n, title, inv) => `Hi ${n}! Friendly reminder on ${title}${inv ? " (#" + inv + ")" : ""}. 😊 ${brand()}`,
    direct: (n, title, inv) => `Hi ${n}, following up on ${title}${inv ? " inv #" + inv : ""}. Reply when you can. ${brand()}`,
    casual: (n, title, inv) => `Hey ${n}! ${title}${inv ? " #" + inv : ""} — still on our list. Holler if you need us! ⚡`,
    urgent: (n, title, inv) => `Hi ${n}, need to hear back on ${title}${inv ? " #" + inv : ""} today. — ${brand()}`,
  },
};

/** Default subject for email compose. */
export function defaultEmailSubject(job, context) {
  const inv = job?.invoiceNo;
  const est = job?.estimateNo;
  if (context === "payment" && inv) return `Invoice #${inv} — pay online — ${brand()}`;
  if (context === "reminder" && inv) return `Payment reminder — invoice #${inv}`;
  if (est) return `Estimate follow-up — ${brand()}`;
  return `${brand()} — ${(job?.title || job?.customer || "your project").trim()}`;
}

/** Generate a draft message for the chosen channel, context, and mood. */
export function generateCustomerMessage(job, { channel = "email", context = "general", mood = "friendly", url, subject, body } = {}) {
  if (context === "custom") {
    if (channel === "sms" && body) return emailToSms(body, url);
    return body || "";
  }
  if (context === "payment" && subject && body) {
    if (channel === "sms") return emailToSms(body, url);
    return body;
  }

  const n = firstName(job?.customer);
  const title = (job?.title || job?.serviceType || "your project").trim();
  const inv = job?.invoiceNo || "";
  const due = fmtAmountDue(job) || fmt$(openBalance(job)) || fmt$(invoiceTotal(job)) || "—";
  const pool =
    context === "payment" ? PAYMENT[channel] : context === "reminder" ? REMINDER[channel] : GENERAL[channel];
  const fn = pool[mood] || pool.friendly;
  return context === "payment" ? fn(n, inv, due, url) : context === "reminder" ? fn(n, title, inv) : fn(n, title);
}

/** Starter draft before mood is picked. */
export function defaultComposeDraft(job, { channel = "email", context = "general", url, subject, body } = {}) {
  if (context === "payment" && body) {
    return channel === "sms" ? emailToSms(body, url) : body;
  }
  if (context === "reminder") {
    const inv = job?.invoiceNo ? "invoice #" + job.invoiceNo : "your job";
    const n = firstName(job?.customer);
    if (channel === "sms") {
      return `Hi ${n}, friendly reminder about ${job?.title || "your job"} (${inv}). Reply with any questions. ${sign("sms")}`;
    }
    return `Hi ${n}, just a friendly reminder about your ${job?.title || "job"} (${inv}). Please let us know if you have any questions. ${sign("email")}`;
  }
  const n = firstName(job?.customer);
  const title = (job?.title || "your project").trim();
  if (channel === "sms") {
    return `Hi ${n}, ${brand()} re: ${title}. Let us know if you need anything. ${sign("sms")}`;
  }
  return `Hi ${n},\n\nChecking in about ${title}. Let us know if you have any questions.\n\n${sign("email")}`;
}