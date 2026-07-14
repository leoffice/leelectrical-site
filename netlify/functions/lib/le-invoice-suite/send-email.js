/**
 * send-email.js — send a QuickBooks-style invoice email from your own account.
 *
 * Composes the branded HTML email (email-template.js), attaches the
 * matching PDF (qb-pdf.js), and sends it via SMTP — starting with Gmail.
 *
 * Setup (Gmail):
 *   1. Google Account -> Security -> 2-Step Verification (must be ON)
 *   2. Security -> App passwords -> create one for "Mail"
 *   3. Set environment variables (never hard-code the password):
 *        GMAIL_USER=youraddress@gmail.com
 *        GMAIL_APP_PASSWORD=xxxxxxxxxxxxxxxx
 *
 * Dependencies: npm install nodemailer pdfkit
 */

'use strict';

const path = require('path');
const nodemailer = require('nodemailer');
const { generateDocument } = require('./qb-pdf');
const { buildEmailHTML, buildPayLink } = require('./email-template');

function makeTransport() {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
}

/**
 * Send an invoice/estimate email with the PDF attached.
 *
 * @param {object} invoice  same data shape as qb-pdf.js generateDocument()
 *                          plus: { to, cc, bcc, amountDue, payLink? }
 */
async function sendInvoiceEmail(invoice) {
  const docType = (invoice.docType || 'INVOICE').toUpperCase();
  const docWord = docType === 'ESTIMATE' ? 'Estimate' : 'Invoice';

  // 1. generate the PDF in memory
  const pdfBuffer = await generateDocument(invoice);

  // 2. payment link (Cardknox — same pattern QuickBooks was generating).
  // Auto-generated for invoices only; estimates get one only if you pass
  // payLink explicitly (e.g. deposit request).
  const payLink = invoice.payLink || (docType === 'INVOICE' ? buildPayLink({
    amount: invoice.amountDue,
    invoiceNumber: invoice.docNumber,
    customerName: invoice.billTo.name,
    customerEmail: invoice.to,
  }) : undefined);

  // 3. build the HTML body
  // viewLink: where "View invoice" points — e.g. a page in your app that
  // shows/serves the invoice PDF. If you don't have one yet, omit it and
  // only the green "View and Pay" button renders (the PDF is attached anyway).
  const html = buildEmailHTML({
    ...invoice,
    viewLink: invoice.viewLink,
    payLink,
    logoSrc: 'cid:companylogo',
  });

  // 4. send
  const transport = makeTransport();
  const info = await transport.sendMail({
    from: { name: invoice.company.name, address: process.env.GMAIL_USER },
    to: invoice.to,
    cc: invoice.cc,
    bcc: invoice.bcc,
    replyTo: invoice.company.email,
    subject: `${docWord} #${invoice.docNumber} from ${invoice.company.name}`,
    html,
    text:
      `${docWord} ${invoice.docNumber} from ${invoice.company.name}\n` +
      `Due ${invoice.dueDate} — $${invoice.amountDue}\n\n` +
      `Pay online: ${payLink}\n\nThe ${docWord.toLowerCase()} PDF is attached.`,
    attachments: [
      {
        filename: `${docWord}_${invoice.docNumber}_from_${invoice.company.name.replace(/[^\w]+/g, '_')}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      },
      {
        filename: 'logo.png',
        path: path.join(__dirname, 'assets', 'logo.png'),
        cid: 'companylogo',           // referenced by the HTML as cid:companylogo
      },
    ],
  });
  return info;
}

module.exports = { sendInvoiceEmail };
