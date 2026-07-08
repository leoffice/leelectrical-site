// Build appointment prefill from the current route (job or customer view).
import { customerContact, jobsForCustomerKey } from "./customers.js";
import { effectiveServiceAddress } from "./customerSync.js";

/** Pseudo-job object for AddAppointmentSheet from FAB context. */
export function appointmentContextFromRoute(pathname, { effectiveJob, jobs }) {
  if (!pathname) return null;
  if (pathname.startsWith("/job/")) {
    const id = decodeURIComponent(pathname.split("/job/")[1] || "").split("?")[0];
    const j = effectiveJob(id);
    return j || null;
  }
  if (pathname.startsWith("/customer/")) {
    const key = decodeURIComponent(pathname.split("/customer/")[1] || "").split("?")[0];
    const list = jobsForCustomerKey(jobs, key);
    if (!list.length) return null;
    const contact = customerContact(list);
    const primary = list[0];
    return {
      ...primary,
      id: primary.id,
      customer: contact.name || primary.customer,
      businessName: contact.businessName || primary.businessName || contact.name,
      personName: contact.personName || primary.personName,
      phone: contact.phone || primary.phone,
      email: contact.email || primary.email,
      billingAddress: contact.billingAddress || primary.billingAddress,
      apartment: contact.apartment || primary.apartment || "",
      serviceAddress: contact.address || effectiveServiceAddress(primary),
      address: contact.address || effectiveServiceAddress(primary),
      title: primary.title || "",
      _customerContext: true,
    };
  }
  return null;
}