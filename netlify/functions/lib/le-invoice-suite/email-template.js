/**
 * email-template.js — QuickBooks-style invoice/estimate email for BLZ Electric Inc.
 *
 * Rebuilds the layout of the QBO invoice notification email as a clean,
 * self-contained template — company-branded only (no QuickBooks/Intuit
 * branding, no tracking pixels, no link-wrapping).
 *
 * Usage:
 *   const { buildEmailHTML, buildPayLink } = require('./email-template');
 *   const html = buildEmailHTML(data);      // pass to nodemailer as `html`
 *
 * The logo is referenced as cid:companylogo — attach assets/logo.png with
 * that Content-ID when sending (send-email.js does this for you).
 */

'use strict';

/* Design tokens taken from the original email */
const T = {
  font: 'ArialMT,Arial,Helvetica,sans-serif',
  text: '#393a3d',        // primary text
  muted: '#6b6c72',       // secondary gray
  green: '#066a34',       // company name
  bannerBg: '#cde1d6',    // pale green banner
  sectionBg: '#f4f5f8',   // bill-to gray band
  rule: 'dotted 1px #babec5',
  buttonBg: '#393a3d',    // "View invoice" button
  payButtonBg: '#066a34', // "View and Pay" button (your green)
  width: 768,
};

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const nl2br = (s) => esc(s).replace(/\r?\n/g, '<br>');
const money = (n) => '$' + Number(n).toLocaleString('en-US',
  { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Build a Cardknox payment link (same pattern QuickBooks generated for you).
 * @param {object} o { amount, invoiceNumber, customerName, customerEmail }
 */
function buildPayLink(o, cfg = {}) {
  const base = cfg.base || 'https://secure.cardknox.com/blzelectric';
  const redirect = cfg.redirectUrl || 'https://leelectrical.us/.netlify/functions/sola-payment';
  const q = new URLSearchParams({
    xAmount: String(o.amount),
    xinvoice: String(o.invoiceNumber),
    xRedirectURL: redirect,
    xPostURL: redirect,
    xCustom01: String(o.amount),
    xBillLastName: o.customerName || '',
    xEmail: o.customerEmail || '',
  });
  return `${base}?${q.toString()}`;
}

/**
 * Shared doc body pieces (invoice/estimate). Used by the full legacy layout
 * and by the APPROVED STANDARD shell path (body-only → buildBrandedEmailHtml).
 */
function prepareDoc(d) {
  const docType = (d.docType || 'INVOICE').toUpperCase();
  const lines = Array.isArray(d.lines) ? d.lines : [];
  const subtotal = d.subtotal != null ? d.subtotal
    : lines.reduce((s, l) => s + Number(l.amount), 0);
  const tax = d.tax || 0;
  const total = d.total != null ? d.total : subtotal + tax;
  const balanceDue = d.balanceDue != null ? d.balanceDue : d.amountDue;
  const isEstimate = docType === 'ESTIMATE';
  return { docType, lines, subtotal, tax, total, balanceDue, isEstimate };
}

function btnCell(label, href, bg) {
  return `
      <td style="border-radius:4px;background-color:${bg};text-align:center;">
        <a href="${esc(href)}" style="display:inline-block;font-weight:bold;color:#ffffff;
           text-decoration:none;padding:10px 40px;font-size:16px;white-space:nowrap;">${esc(label)}</a>
      </td>`;
}

function btnRow(d, isEstimate) {
  const cells = [];
  const viewLabel = d.viewLabel || (isEstimate ? 'View/Accept Estimate' : 'View/Pay Invoice');
  if (d.viewLink) cells.push(btnCell(viewLabel, d.viewLink, T.buttonBg));
  if (d.payLink) cells.push(btnCell(d.payLabel || 'View and Pay', d.payLink, T.payButtonBg));
  if (!cells.length) return '';
  return `
    <table cellpadding="0" cellspacing="0" border="0" style="margin:auto;">
      <tr>${cells.join('<td style="width:16px;font-size:0;">&nbsp;</td>')}</tr>
    </table>`;
}

/**
 * BODY-ONLY invoice/estimate content for the standard branded shell.
 * No letterhead, no signature, no Powered-by — those come from
 * emailBranding.buildBrandedEmailHtml (APPROVED STANDARD).
 */
function buildEmailBodyHTML(d) {
  const { docType, lines, subtotal, tax, total, balanceDue, isEstimate } = prepareDoc(d);

  const customFieldRows = (d.customFields || [])
    .filter((c) => c && c.value)
    .map((c) => `
      <tr class="le-fieldrow">
        <td class="le-fieldlabel" style="font-size:16px;font-weight:bold;vertical-align:top;padding:8px 5px 0 0;width:100px;white-space:nowrap;">${esc(c.label)}</td>
        <td class="le-fieldvalue" style="font-size:16px;padding:8px 5px 0 5px;overflow-wrap:anywhere;word-break:normal;">${esc(c.value)}</td>
      </tr>`).join('');

  const lineItems = lines.map((l) => `
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="font-family:${T.font};color:${T.text};padding-top:14px;">
      <tr><td style="font-size:14px;padding:8px 0 0 0;line-height:1.35;color:${T.muted};">${nl2br(l.description)}</td></tr>
      <tr><td style="font-size:14px;padding:6px 0 0 0;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:${T.font};color:${T.text};">
          <tr>
            <td style="padding:0 20px 0 0;">${esc(l.qty)} X ${money(l.rate)}</td>
            <td align="right" style="text-align:right;color:${T.text};font-size:14px;">${money(l.amount)}</td>
          </tr>
        </table>
      </td></tr>
    </table>`).join('');

  const totalsRow = (label, value) => `
    <tr>
      <td style="padding:0 24px 12px 0;color:${T.text};font-size:14px;">${esc(label)}</td>
      <td style="text-align:right;padding:0 0 12px 0;font-size:14px;">${esc(value)}</td>
    </tr>`;

  return `
<style>
  .le-fieldrow td { word-break: normal; overflow-wrap: anywhere; }
  @media only screen and (max-width:480px) {
    .le-fieldrow td { display:block !important; width:100% !important; }
    .le-fieldlabel { padding:8px 0 0 0 !important; }
    .le-fieldvalue { padding:2px 0 8px 0 !important; }
  }
</style>
<div style="font-family:${T.font};color:${T.text};">
  <div style="font-size:12px;text-align:center;color:${T.muted};margin-bottom:12px;letter-spacing:.04em;">
    ${docType}&nbsp;&nbsp; ${esc(d.docNumber)} DETAILS</div>

  <!-- amount banner + CTA -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0"
         style="font-family:${T.font};width:100%;background-color:${T.bannerBg};text-align:center;border-radius:8px;">
    <tr><td style="padding:24px 12px 18px 12px;">
      <div style="font-size:14px;font-weight:bold;color:${T.text};">${isEstimate ? 'TOTAL' : 'DUE ' + esc(d.dueDate)}</div>
      <div style="font-size:40px;font-weight:bold;color:${T.text};padding:8px 0 12px 0;">${money(d.amountDue)}</div>
      <div style="padding:0 0 6px 0;">${btnRow(d, isEstimate)}</div>
    </td></tr>
  </table>

  ${d.topMessage ? `
  <div style="font-size:15px;line-height:1.5;text-align:left;padding:16px 0 0 0;">
    <p style="margin:12px 0;">${nl2br(d.topMessage)}</p>
  </div>` : ''}

  <!-- bill to -->
  <div style="background-color:${T.sectionBg};padding:16px 14px;margin:16px 0 0 0;border-radius:8px;">
    <table width="100%" style="font-family:${T.font};color:${T.text};table-layout:auto;">
      <tr class="le-fieldrow">
        <td class="le-fieldlabel" style="vertical-align:top;font-weight:bold;font-size:15px;padding:6px 5px;width:90px;white-space:nowrap;">Bill to</td>
        <td class="le-fieldvalue" style="font-size:15px;padding:6px 5px;overflow-wrap:anywhere;word-break:normal;">
          ${esc(d.billTo && d.billTo.name)}<br>${((d.billTo && d.billTo.addressLines) || []).map(esc).join('<br>')}</td>
      </tr>
      ${customFieldRows}
    </table>
  </div>

  <!-- line items -->
  <div style="border-bottom:${T.rule};padding:18px 0;">
    ${d.serviceDate ? `<div style="font-size:14px;color:${T.muted};padding:4px 0 0 0;">${esc(d.serviceDate)}</div>` : ''}
    ${lineItems}
  </div>

  <!-- totals -->
  <div style="text-align:right;padding:18px 0 8px 0;">
    <table cellpadding="0" cellspacing="0" border="0" align="right" style="font-family:${T.font};color:${T.text};font-size:14px;">
      ${totalsRow('Subtotal', money(subtotal))}
      ${totalsRow('Tax', money(tax))}
      ${totalsRow('Total', money(total))}
      ${isEstimate ? '' : totalsRow('Balance due', money(balanceDue))}
    </table>
  </div>
  <div style="clear:both;"></div>

  ${(d.paymentMessageHtml || d.paymentMessage) ? `
  <div style="font-size:14px;padding:14px 0;text-align:left;border-bottom:${T.rule};color:${T.muted};line-height:1.5;">
    ${d.paymentMessageHtml || nl2br(d.paymentMessage)}</div>` : ''}

  <div style="font-size:14px;padding:14px 0 0 0;color:${T.muted};text-align:left;line-height:1.5;">
    Thank you for your business!<br><br>
    If you have any questions concerning this ${docType.toLowerCase()} please contact us.
  </div>

  <div style="border-top:${T.rule};text-align:center;padding:18px 0 4px 0;font-size:12px;color:${T.muted};">
    If you receive an email that seems fraudulent, please check with the business owner before paying.
  </div>
</div>`;
}

/**
 * @param {object} d
 * @param {'INVOICE'|'ESTIMATE'} [d.docType='INVOICE']
 * @param {string} d.docNumber
 * @param {string} d.dueDate            e.g. "08/01/2026"
 * @param {number} d.amountDue          the big number in the banner
 * @param {object} d.company            { name, addressLines[], phone, email }
 * @param {object} d.billTo             { name, addressLines[] }
 * @param {Array}  [d.customFields]     [{ label, value }]
 * @param {string} [d.serviceDate]
 * @param {Array}  d.lines              [{ description, rate, qty, amount }]
 * @param {number} [d.subtotal] [d.tax] [d.total] [d.balanceDue]
 * @param {string} [d.payLink]          "Print or save" / pay button target
 * @param {string} [d.buttonLabel='Print or save']
 * @param {string} [d.topMessage]       text right under the banner (supports \n)
 * @param {string} [d.paymentMessage]   payment-options block (supports \n; escaped)
 * @param {string} [d.paymentMessageHtml] pre-built HTML payment block (e.g. clickable Link)
 * @param {string} [d.logoSrc='cid:companylogo']  tenant logo (header brand)
 * @param {string} [d.poweredByHtml]   constant 'Powered by LE' footer block
 * @param {boolean} [d.bodyOnly=false] when true, return body fragment only (for shell wrap)
 */
function buildEmailHTML(d) {
  // Prefer body-only when the caller will wrap with the standard branded shell.
  if (d && d.bodyOnly) return buildEmailBodyHTML(d);

  const { docType, lines, subtotal, tax, total, balanceDue, isEstimate } = prepareDoc(d);
  const logoSrc = d.logoSrc || 'cid:companylogo';

  const customFieldRows = (d.customFields || [])
    .filter((c) => c && c.value)
    .map((c) => `
      <tr class="le-fieldrow">
        <td class="le-fieldlabel" style="font-size:18px;font-weight:bold;vertical-align:top;padding:10px 5px 0 5px;width:110px;white-space:nowrap;">${esc(c.label)}</td>
        <td class="le-fieldvalue" style="font-size:18px;padding:10px 5px 0 5px;overflow-wrap:anywhere;word-break:normal;min-width:200px;">${esc(c.value)}</td>
      </tr>`).join('');

  const lineItems = lines.map((l) => `
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="font-family:${T.font};color:${T.text};padding-top:20px;">
      <tr><td style="font-size:16px;padding:10px 0 0 0;line-height:1.35;color:${T.muted};width:75%;">${nl2br(l.description)}</td></tr>
      <tr><td style="font-size:16px;padding:10px 0 0 0;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:${T.font};color:${T.text};">
          <tr>
            <td style="padding:0 20px 0 0;">${esc(l.qty)} X ${money(l.rate)}</td>
            <td align="right" style="text-align:right;color:${T.text};font-size:16px;">${money(l.amount)}</td>
          </tr>
        </table>
      </td></tr>
    </table>`).join('');

  const totalsRow = (label, value) => `
    <tr>
      <td style="padding:0 40px 20px 0;color:${T.text};">${esc(label)}</td>
      <td style="text-align:right;padding:0 0 20px 0;">${esc(value)}</td>
    </tr>`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(d.company.name)}</title>
<style>
  /* Bill-to used a rigid 250px label cell, so on a phone the details column
     collapsed and the customer name wrapped one letter per line. Stack the
     label above the details under 480px and never break inside a word. */
  .le-fieldrow td { word-break: normal; overflow-wrap: anywhere; }
  @media only screen and (max-width:480px) {
    .le-fieldrow td { display:block !important; width:100% !important; }
    .le-fieldlabel { padding:10px 5px 0 5px !important; }
    .le-fieldvalue { padding:2px 5px 10px 5px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#ffffff;">
<div style="font-family:${T.font};color:${T.text};padding-top:0.5in;padding-bottom:0.25in;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:${T.font};color:${T.text};">
<tr><td></td><td width="${T.width}" align="center">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:${T.font};color:${T.text};width:100%;">

<!-- title -->
<tr><td>
  <div style="font-size:13px;text-align:center;color:${T.muted};margin-bottom:10px;">
    ${docType}&nbsp;&nbsp; ${esc(d.docNumber)} DETAILS</div>

  <!-- logo + company name -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:${T.font};">
    <tr><td style="text-align:center;padding:0;">
      <img alt="${esc(d.company.name)}" src="${esc(logoSrc)}" height="160" style="height:160px;"></td></tr>
    <tr><td style="font-size:20px;text-align:center;padding:14px 0 0 0;color:${T.green};">
      ${esc(d.company.name)}</td></tr>
  </table>
  <br><br>

  <!-- banner -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0"
         style="font-family:${T.font};width:100%;background-color:${T.bannerBg};text-align:center;">
    <tr><td style="padding:31px 0 20px 0;">
      <div style="font-size:16px;font-weight:bold;color:${T.text};">${isEstimate ? 'TOTAL' : 'DUE ' + esc(d.dueDate)}</div>
      <div style="font-size:48px;font-weight:bold;color:${T.text};padding:9px 0 12px 0;">${money(d.amountDue)}</div>
      <div style="padding:0 0 10px 0;">${btnRow(d, isEstimate)}</div>
    </td></tr>
  </table>

  ${d.topMessage ? `
  <div style="font-size:18px;line-height:1.5;text-align:left;padding:20px 20px 0 40px;">
    <p style="margin:16px 0;">${nl2br(d.topMessage)}</p>
  </div>` : ''}
</td></tr>

<!-- bill to / custom fields on gray -->
<tr><td style="background-color:${T.sectionBg};padding:20px 0;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:${T.font};color:${T.text};">
    <tr>
      <td style="padding:10px 20px 10px 40px;">
        <table width="100%" style="font-family:${T.font};color:${T.text};table-layout:auto;">
          <tr class="le-fieldrow">
            <td class="le-fieldlabel" style="vertical-align:top;font-weight:bold;font-size:18px;padding:10px 5px;width:110px;white-space:nowrap;">Bill to</td>
            <td class="le-fieldvalue" style="font-size:18px;padding:10px 5px;overflow-wrap:anywhere;word-break:normal;min-width:200px;">
              ${esc(d.billTo.name)}<br>${(d.billTo.addressLines || []).map(esc).join('<br>')}</td>
          </tr>
        </table>
      </td>
    </tr>
    ${customFieldRows ? `<tr><td style="padding:10px 20px 10px 40px;">
      <table width="100%" style="font-family:${T.font};color:${T.text};border-top:${T.rule};">${customFieldRows}</table>
    </td></tr>` : ''}
  </table>
</td></tr>

<!-- line items -->
<tr><td style="border-bottom:${T.rule};padding:40px 40px;">
  ${d.serviceDate ? `<div style="font-size:16px;color:${T.muted};padding:10px 0 0 0;">${esc(d.serviceDate)}</div>` : ''}
  ${lineItems}
</td></tr>

<!-- totals -->
<tr><td align="right" style="padding:40px 40px 20px 0;">
  <table cellpadding="0" cellspacing="0" border="0" style="font-family:${T.font};color:${T.text};font-size:18px;">
    ${totalsRow('Subtotal', money(subtotal))}
    ${totalsRow('Tax', money(tax))}
    ${totalsRow('Total', money(total))}
    ${isEstimate ? '' : totalsRow('Balance due', money(balanceDue))}
  </table>
</td></tr>

<!-- payment message (HTML form allows a clickable "Link" after Zelle) -->
${(d.paymentMessageHtml || d.paymentMessage) ? `
<tr><td style="font-size:18px;padding:20px 40px;text-align:left;border-bottom:${T.rule};color:${T.muted};line-height:1.5;">
  ${d.paymentMessageHtml || nl2br(d.paymentMessage)}</td></tr>` : ''}

<!-- footer note -->
<tr><td style="font-size:18px;padding:20px 40px;color:${T.muted};text-align:left;line-height:1.5;">
  Thank you for your business!<br><br>
  If you have any questions concerning this ${docType.toLowerCase()} please contact us.<br>
  Phone: ${esc(d.company.phone)} Email: ${esc(d.company.email)}</td></tr>


<!-- company address -->
<tr><td style="border-top:${T.rule};padding:10px 40px 25px 40px;">
  <div style="font-size:15px;text-align:center;color:${T.muted};margin-top:15px;">${esc(d.company.name)}</div>
  <div style="font-size:15px;text-align:center;color:${T.muted};margin-top:15px;">
    ${(d.company.addressLines || []).map(esc).join('<br>')}</div>
  <div style="text-align:center;">
    <div style="font-size:15px;color:${T.muted};margin-top:15px;display:inline-block;margin:15px 10px 0 10px;">${esc(d.company.phone)}</div>
    <div style="font-size:15px;color:${T.muted};margin-top:15px;display:inline-block;margin:15px 10px 0 10px;">${esc(d.company.email)}</div>
  </div>
  ${d.company.license ? `<div style="font-size:15px;text-align:center;color:${T.muted};margin-top:15px;">${esc(d.company.license)}</div>` : ''}
</td></tr>

<!-- anti-fraud note -->
<tr><td style="border-top:${T.rule};text-align:center;padding:27px 0 25px 0;font-size:15px;color:${T.muted};">
  If you receive an email that seems fraudulent, please check with the business owner before paying.
</td></tr>

<!-- powered-by footer (constant across tenants; injected by the caller) -->
${d.poweredByHtml ? `<tr><td style="padding:0;">${d.poweredByHtml}</td></tr>` : ''}

</table>
</td><td></td></tr>
</table>
</div>
</body>
</html>`;
}

module.exports = { buildEmailHTML, buildEmailBodyHTML, buildPayLink };
