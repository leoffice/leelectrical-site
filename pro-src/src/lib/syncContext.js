// QuickBooks sync context from the current route (job or customer view).
import { clientKey, jobsForCustomerKey } from "./customers.js";
import { sortJobs } from "./stages.js";

export function syncContextFromRoute(pathname, { effectiveJob, jobs }) {
  if (!pathname) return { job: null, customerJobs: [], label: "" };

  if (pathname.startsWith("/job/")) {
    const id = decodeURIComponent(pathname.split("/job/")[1] || "").split("?")[0];
    const job = effectiveJob(id);
    if (!job) return { job: null, customerJobs: [], label: "" };
    const custKey = clientKey(job);
    const customerJobs = custKey ? sortJobs(jobsForCustomerKey(jobs, custKey)) : [job];
    const name = (job.businessName || job.customer || "").trim();
    return { job, customerJobs: customerJobs.length ? customerJobs : [job], label: name };
  }

  if (pathname.startsWith("/customer/")) {
    const key = decodeURIComponent(pathname.split("/customer/")[1] || "").split("?")[0];
    const customerJobs = sortJobs(jobsForCustomerKey(jobs, key));
    const job = customerJobs[0] || null;
    const name = job ? (job.businessName || job.customer || "").trim() : "";
    return { job, customerJobs, label: name };
  }

  return { job: null, customerJobs: [], label: "" };
}