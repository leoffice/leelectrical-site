/** Public pay page — check / poll the docs store for an invoice PDF. */

export async function invoicePdfAvailable(url) {
  if (!url) return false;
  try {
    const res = await fetch(url, { method: "HEAD", cache: "no-store" });
    const ct = (res.headers && res.headers.get && res.headers.get("content-type")) || "";
    return res.ok && !ct.includes("application/json");
  } catch {
    return false;
  }
}

/** Poll until the PDF lands (host fetch_pdf) or timeout. */
export async function waitForInvoicePdf(url, { intervalMs = 3000, timeoutMs = 90000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await invoicePdfAvailable(url)) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}