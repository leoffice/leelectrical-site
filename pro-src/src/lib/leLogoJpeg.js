// The embedded logo bytes moved to shared/ so the Cloudflare Pages Function
// that renders invoice PDFs server-side can use them too. Re-exported here so
// existing browser-side callers (requisitionPdf.js) keep their import path.
export { LE_LOGO_JPEG, leLogoJpegBytes } from "../../../shared/leLogoJpeg.mjs";
