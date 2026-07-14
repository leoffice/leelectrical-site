// Page context for developer notes and chat — describes where Levi is in the app.
import { appointmentContextFromRoute } from "./appointmentContext.js";
import { fmt$ } from "./format.js";

/** Human-readable label for the current route. */
export function viewLabel(pathname) {
  if (!pathname || pathname === "/") return "Customers";
  if (pathname.startsWith("/job/")) return "Job detail";
  if (pathname.startsWith("/customer/")) return "Customer";
  if (pathname.startsWith("/projects/")) return "Requisition detail";
  const seg = pathname.replace(/^\//, "").split("/")[0] || "";
  const map = {
    today: "Calendar",
    calls: "Calls",
    time: "Time",
    projects: "Requisition",
    company: "Company",
    progress: "Build",
    dev: "Dev board",
    archive: "Archive",
  };
  return map[seg] || seg || "App";
}

/** Rich context string for dev notes — includes route, view, and job/customer info. */
export function buildPageContext(pathname, { effectiveJob, jobs } = {}) {
  const view = viewLabel(pathname);
  const lines = [`Page: ${view}`, `Route: ${pathname || "/"}`];

  const ctx = appointmentContextFromRoute(pathname, { effectiveJob, jobs });
  if (pathname.startsWith("/job/")) {
    const id = decodeURIComponent(pathname.split("/job/")[1] || "").split("?")[0];
    const j = effectiveJob?.(id) || ctx;
    if (j) {
      lines.push(`Job: ${j.customer || j.businessName || "—"}`);
      if (j.title) lines.push(`Scope: ${j.title}`);
      if (j.invoiceNo) lines.push(`Invoice #${j.invoiceNo}`);
      if (j.estimateNo) lines.push(`Estimate #${j.estimateNo}`);
      if (j.amount) lines.push(`Amount: ${fmt$(j.amount)}`);
      if (j.address || j.serviceAddress) lines.push(`Address: ${j.address || j.serviceAddress}`);
      if (j.id) lines.push(`Job id: ${j.id}`);
    }
  } else if (pathname.startsWith("/customer/")) {
    const key = decodeURIComponent(pathname.split("/customer/")[1] || "").split("?")[0];
    lines.push(`Customer key: ${key}`);
    if (ctx?.customer || ctx?.businessName) lines.push(`Customer: ${ctx.customer || ctx.businessName}`);
  }

  return lines.join("\n");
}