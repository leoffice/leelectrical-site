import { createRequire } from "module";
import { getStore } from "@netlify/blobs";
import { fileURLToPath } from "url";
import path from "path";
import { canGenerateLocalDoc, docStoreKey, mapJobToQbDocData } from "./jobToQbDoc.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { generateDocument } = require("./le-invoice-suite/qb-pdf.js");

const SUITE_DIR = path.join(__dirname, "le-invoice-suite");

/** Generate a QBO-style PDF from job data and store in the docs blob. */
export async function generateAndStoreDoc({ job, kind = "invoice" }) {
  if (!canGenerateLocalDoc(job, kind)) {
    return { ok: false, reason: "insufficient_data" };
  }
  const data = mapJobToQbDocData(job, kind);
  data.logoPath = path.join(SUITE_DIR, "assets", "logo.png");
  const buf = await generateDocument(data);
  const key = docStoreKey(kind, data.docNumber);
  const store = getStore("docs");
  await store.set(key, buf, {
    metadata: { mime: "application/pdf", bytes: buf.length, ts: Date.now(), source: "local" },
  });
  return { ok: true, key, bytes: buf.length, docNumber: data.docNumber, pdfBuffer: buf };
}