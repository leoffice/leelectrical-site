// Server-side PDF generation (pdfkit) cannot run on Cloudflare's V8 isolate.
// The LE Pro app generates invoice/estimate PDFs entirely client-side and, for
// email, posts the PDF to send-doc-email as pdfB64. Return JSON (never the SPA
// HTML shell) so callers get a clear signal instead of "Unexpected token '<'".
export async function onRequest(context) {
  return new Response(
    JSON.stringify({
      ok: false,
      error: "server_pdf_disabled",
      detail: "PDFs are generated client-side; email attaches the client PDF via send-doc-email (pdfB64).",
    }),
    { status: 200, headers: { "content-type": "application/json", "access-control-allow-origin": "*" } }
  );
}
