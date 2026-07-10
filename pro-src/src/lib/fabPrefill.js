// Soft-prefill for the + FAB from the current job or customer page.
import { clientKey, jobsForCustomerKey, openBalance } from "./customers.js";
import { effectiveServiceAddress } from "./customerSync.js";

/** Draft job fields for invoice builder from FAB route context. */
export function draftJobFromFabContext(context) {
  if (!context) return {};
  const biz = context.businessName || context.customer || "";
  const svc = context.serviceAddress || context.address || "";
  return {
    customer: biz,
    businessName: biz,
    personName: context.personName || "",
    phone: context.phone || "",
    email: context.email || "",
    billingAddress: context.billingAddress || "",
    serviceAddress: svc,
    address: svc,
    apartment: context.apartment || "",
    qboCustomerId: context.qboCustomerId || "",
    parentCustomerName: context.parentCustomerName || "",
    parentQboCustomerId: context.parentQboCustomerId || "",
    title: context.title || "",
    invoiceNo: context.invoiceNo || "",
    estimateNo: context.estimateNo || "",
  };
}

/** Resolve payment FAB step from page context. */
export function paymentFabStep(context, jobs) {
  if (!context) return { step: "paymentIntro" };
  if (context.id && !context._customerContext) {
    if (context.invoiceNo) return { step: "pickPayment", job: context };
    return {
      step: "pickPayment",
      customerKey: clientKey(context),
      customerName: context.customer || context.businessName || "",
    };
  }
  if (context._customerContext) {
    const key = clientKey(context);
    const list = jobsForCustomerKey(jobs || [], key).filter((j) => !j.paid && openBalance(j) > 0.01);
    if (list.length === 1) return { step: "pickPayment", job: list[0] };
    if (list.length > 0) {
      return {
        step: "pickPayment",
        customerKey: key,
        customerName: context.customer || context.businessName || "",
      };
    }
    return {
      step: "pickPayment",
      customerKey: key,
      customerName: context.customer || context.businessName || "",
    };
  }
  return { step: "paymentIntro" };
}

/** Customer-scoped payment picker prefill. */
export function paymentPickerPrefill(context, jobs) {
  const resolved = paymentFabStep(context, jobs);
  if (resolved.customerKey) {
    return {
      customerKey: resolved.customerKey,
      customerName: resolved.customerName || "",
    };
  }
  return null;
}