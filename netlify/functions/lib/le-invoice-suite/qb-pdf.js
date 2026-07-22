/**
 * qb-pdf.js — QuickBooks-style Invoice / Estimate PDF generator
 * for BLZ Electric Inc.
 *
 * Reproduces the QuickBooks Online "Friendly/Modern" print template
 * pixel-for-pixel (measured from a real QBO-generated PDF).
 *
 * Usage:
 *   const { generateDocument } = require('./qb-pdf');
 *   const buffer = await generateDocument(data);            // get a Buffer
 *   await generateDocument(data, 'out/invoice-1001.pdf');   // or write a file
 *
 * See example.js for the full data shape.
 *
 * Dependencies: npm install pdfkit
 * Ships with: fonts/LiberationSans-{Regular,Bold}.ttf (Arial-metric-compatible,
 * SIL OFL licensed) and assets/logo.png
 */

'use strict';

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

/* ------------------------------------------------------------------ *
 *  STYLE — every value below was measured from the original QBO PDF. *
 *  Tweak freely: colors, fonts, column widths, wording.              *
 * ------------------------------------------------------------------ */
const STYLE = {
  page: { size: 'LETTER', margin: 36 },                    // 612 x 792 pt

  colors: {
    green:   '#066a34',   // headings ("ESTIMATE", table header text)
    gray:    '#8d9096',   // field labels, footer, message block
    black:   '#000000',
    headerBg:'#cde1d6',   // table header bar fill
    rule:    '#babec5',   // dotted separator lines
  },

  fonts: {
    regular: path.join(__dirname, 'fonts', 'LiberationSans-Regular.ttf'),
    bold:    path.join(__dirname, 'fonts', 'LiberationSans-Bold.ttf'),
  },

  logo: {
    path: path.join(__dirname, 'assets', 'logo.png'),
    x: 254.25, y: 36, w: 103.5, h: 81,                     // centered top
  },

  company: {
    nameSize: 10.98, nameY: 46.5,                          // bold, black
    detailSize: 7.32, detailStartY: 61.5, detailLeading: 12.75,
  },

  // Levi 2026-07-22: ESTIMATE/INVOICE top-right at logo height; meta under it.
  title:   { size: 13.72, baselineY: 50 },                 // "ESTIMATE"/"INVOICE" = logo top band

  // Meta block — doc no + dates under the title word (right column only)
  meta: {
    labelSize: 9.15, leading: 13.5,
    rightLabelX: 396.45, rightValueX: 477.23,
    firstBaselineY: 68,                                     // under title
  },

  // Addresses: BILLING left · SERVICE right (parallel, halfway)
  address: {
    labelSize: 9.15, leading: 14.25, valueSize: 9.15,
    leftX: 36, rightX: 306,                                 // service col halfway
    gapBelowHeader: 14,
  },

  table: {
    headerH: 21,
    x: 36, w: 540,
    // column right boundaries (from page left)
    colDesc: { textX: 39.75, maxX: 396.5 },   // wrap width incl. trailing-space allowance
    colRate: { rightX: 448.4 },                             // numbers right-aligned
    colQty:  { rightX: 491.6 },
    colAmt:  { rightX: 572.6 },
    headSize: 9.15, headBaselineDy: 14.25,
    bodySize: 10.07, leading: 13.5, firstBaselineDy: 10.75,
    serviceDateGap: 7.5,                                    // gap above service-date row
    rowGap: 7.5,                                            // gap between rows
    contPageTableTop: 130,                                  // table top on continuation pages
  },

  totals: {
    ruleGapAboveY: 11.25,                                   // dotted rule above section
    labelX: 298.96, labelSize: 10.07,
    amtRightX: 572.6,
    leading: 21,
    totalRuleX: 295.5,
    totalGap: 13.5,                                         // extra gap before TOTAL row
    totalAmtSize: 14.09,                                    // bold "$4,400.00"
  },

  message: { x: 36, size: 7.62, leading: 10.5, maxW: 240 }, // gray block left of totals

  acceptance: { size: 9.15, gap1: 45, gap2: 27 },           // estimate only

  footer: {
    size: 10, leading: 14, color: '#8d9096',
    // baselines measured from page bottom (792): 718, 746, 760, 774
    line1Y: 718, blockY: 746,
  },
};

/* ------------------------------------------------------------------ */

const fmtMoney = (n) =>
  Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtQty = (n) => {
  const num = Number(n);
  return Number.isInteger(num) ? String(num) : String(num);
};

/**
 * Generate a QuickBooks-style PDF.
 *
 * @param {object} data
 * @param {'INVOICE'|'ESTIMATE'} [data.docType='INVOICE']
 * @param {object}  data.company   { name, addressLines[], phone, email }
 * @param {string}  data.docNumber e.g. "251844"
 * @param {string}  data.date      display string e.g. "07/13/2026"
 * @param {string}  [data.dueDate]   invoices only
 * @param {string}  [data.terms]     invoices only, e.g. "Net 30"
 * @param {object}  data.billTo    { name, addressLines[] }
 * @param {Array}   [data.customFields] [{ label, value }] e.g. SERVICE ADDRESS
 * @param {string}  [data.serviceDate] shown as first table row
 * @param {Array}   data.lines     [{ description, rate, qty, amount }]
 * @param {number}  [data.subtotal] computed from lines if omitted
 * @param {number}  [data.tax=0]
 * @param {number}  [data.total]    computed if omitted
 * @param {string[]} [data.messageLines] gray block bottom-left
 * @param {string[]} [data.footerLines]  centered page footer
 * @param {boolean} [data.showAcceptance] default true for ESTIMATE
 * @param {string}  [data.logoPath] override bundled logo
 * @param {string}  [outPath] if given, writes the file and resolves with the path
 * @returns {Promise<Buffer|string>}
 */
function generateDocument(data, outPath) {
  return new Promise((resolve, reject) => {
    const S = STYLE;
    const docType = (data.docType || 'INVOICE').toUpperCase();
    const isEstimate = docType === 'ESTIMATE';

    const subtotal = data.subtotal != null
      ? Number(data.subtotal)
      : data.lines.reduce((s, l) => s + Number(l.amount), 0);
    const tax = Number(data.tax || 0);
    const total = data.total != null ? Number(data.total) : subtotal + tax;

    const doc = new PDFDocument({
      size: S.page.size,
      margins: { top: S.page.margin, bottom: S.page.margin, left: S.page.margin, right: S.page.margin },
      bufferPages: true,
      autoFirstPage: true,
      info: { Title: `${docType} ${data.docNumber || ''}`.trim(), Author: data.company.name },
    });

    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => {
      const buf = Buffer.concat(chunks);
      if (outPath) fs.writeFile(outPath, buf, (e) => (e ? reject(e) : resolve(outPath)));
      else resolve(buf);
    });
    doc.on('error', reject);

    doc.registerFont('reg', S.fonts.regular);
    doc.registerFont('bold', S.fonts.bold);

    const M = S.page.margin;
    const pageW = doc.page.width;

    /* -- helpers ---------------------------------------------------- */

    // pdfkit's doc.text() positions by TOP of line; the QBO template was
    // measured by BASELINE. This helper converts baseline -> top.
    const textAtBaseline = (str, x, baselineY, opts = {}) => {
      const size = opts.size || doc._fontSize;
      const ascent = (doc._font.ascender / 1000) * size;
      doc.text(str, x, baselineY - ascent, { lineBreak: false, ...opts });
    };

    const rightText = (str, rightX, baselineY, opts = {}) => {
      const w = doc.widthOfString(str);
      textAtBaseline(str, rightX - w, baselineY, opts);
    };

    const dottedRule = (x1, x2, y) => {
      doc.save()
        .moveTo(x1, y).lineTo(x2, y)
        .lineWidth(1)
        .dash(1, { space: 2 })
        .strokeColor(S.colors.rule)
        .stroke()
        .undash()
        .restore();
    };

    const drawTableHeader = (topY) => {
      doc.rect(S.table.x, topY, S.table.w, S.table.headerH).fill(S.colors.headerBg);
      doc.font('reg').fontSize(S.table.headSize).fillColor(S.colors.green);
      const by = topY + S.table.headBaselineDy;
      textAtBaseline('DESCRIPTION', S.table.colDesc.textX, by);
      rightText('RATE', S.table.colRate.rightX, by);
      rightText('QTY', S.table.colQty.rightX, by);
      rightText('AMOUNT', S.table.colAmt.rightX, by);
      return topY + S.table.headerH;
    };

    const footerBottomLimit = 700; // content must stop above the footer zone

    /* -- header: company block + logo ------------------------------- */

    const drawPageHeader = () => {
      doc.font('bold').fontSize(S.company.nameSize).fillColor(S.colors.black);
      textAtBaseline(data.company.name, M, S.company.nameY);

      doc.font('reg').fontSize(S.company.detailSize);
      // License sits under email — not next to the company name.
      const details = [
        ...(data.company.addressLines || []),
        data.company.phone,
        data.company.email,
        data.company.license,
      ].filter(Boolean);
      details.forEach((line, i) =>
        textAtBaseline(line, M, S.company.detailStartY + i * S.company.detailLeading));

      const logoPath = data.logoPath || S.logo.path;
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, S.logo.x, S.logo.y, { fit: [S.logo.w, S.logo.h], align: 'center' });
      }
    };

    /* -- footer (drawn on every page at the end) --------------------- */

    const drawFooter = (pageNo, pageCount) => {
      doc.font('reg').fontSize(S.footer.size).fillColor(S.footer.color);
      const center = (str, baselineY) => {
        const w = doc.widthOfString(str);
        textAtBaseline(str, (pageW - w) / 2, baselineY);
      };
      const lines = data.footerLines || [
        'Thank you for your business!',
        '',
        `If you have any questions concerning this ${docType.toLowerCase()} please contact us.`,
        `Phone: ${data.company.phone} Email: ${data.company.email}`,
      ];
      center(lines[0], S.footer.line1Y);
      let y = S.footer.blockY;
      for (const l of lines.slice(2)) { center(l, y); y += S.footer.leading; }
      center(`Page ${pageNo} of ${pageCount}`, y);
    };

    /* ================= PAGE 1 ======================================= */

    // Company + logo
    const companyBottom = (() => {
      doc.font('bold').fontSize(S.company.nameSize).fillColor(S.colors.black);
      textAtBaseline(data.company.name, M, S.company.nameY);
      doc.font('reg').fontSize(S.company.detailSize);
      const details = [
        ...(data.company.addressLines || []),
        data.company.phone,
        data.company.email,
        data.company.license,
      ].filter(Boolean);
      details.forEach((line, i) =>
        textAtBaseline(line, M, S.company.detailStartY + i * S.company.detailLeading));
      const logoPath = data.logoPath || S.logo.path;
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, S.logo.x, S.logo.y, { fit: [S.logo.w, S.logo.h], align: 'center' });
      }
      return S.company.detailStartY + details.length * S.company.detailLeading;
    })();

    // Title top-right at logo height (Levi 2026-07-22)
    doc.font('reg').fontSize(S.title.size).fillColor(S.colors.green);
    rightText(docType, pageW - M, S.title.baselineY);

    // Meta under the title word — doc number + dates (right column only)
    const rightRows = [[docType, data.docNumber], ['DATE', data.date]];
    if (!isEstimate && data.dueDate) rightRows.push(['DUE DATE', data.dueDate]);
    if (!isEstimate && data.terms)   rightRows.push(['TERMS', data.terms]);
    let ry = S.meta.firstBaselineY;
    doc.fontSize(S.meta.labelSize);
    for (const [label, value] of rightRows) {
      doc.fillColor(S.colors.gray);
      textAtBaseline(label, S.meta.rightLabelX, ry);
      doc.fillColor(S.colors.black);
      textAtBaseline(String(value ?? ''), S.meta.rightValueX, ry);
      ry += S.meta.leading;
    }
    const rightBottom = ry;
    const logoBottom = S.logo.y + S.logo.h;

    // Addresses: BILLING left · SERVICE right (parallel)
    let addrTop = Math.max(companyBottom, logoBottom, rightBottom) + S.address.gapBelowHeader;
    const billLines = [data.billTo && data.billTo.name, ...((data.billTo && data.billTo.addressLines) || [])].filter(Boolean);
    const svcField = (data.customFields || []).find(
      (cf) => cf && /service\s*address/i.test(String(cf.label || '')) && cf.value
    );
    const svcLines = svcField
      ? String(svcField.value).split(/\n/).map((s) => s.trim()).filter(Boolean)
      : (data.serviceAddress
          ? String(data.serviceAddress).split(/\n/).map((s) => s.trim()).filter(Boolean)
          : []);

    doc.font('reg').fontSize(S.address.labelSize).fillColor(S.colors.gray);
    textAtBaseline('BILLING ADDRESS', S.address.leftX, addrTop);
    let by = addrTop + S.meta.leading;
    doc.fillColor(S.colors.black).fontSize(S.address.valueSize);
    for (const line of billLines) {
      textAtBaseline(line, S.address.leftX, by);
      by += S.address.leading;
    }

    let sy = addrTop;
    if (svcLines.length) {
      doc.fillColor(S.colors.gray).fontSize(S.address.labelSize);
      textAtBaseline('SERVICE ADDRESS', S.address.rightX, addrTop);
      sy = addrTop + S.meta.leading;
      doc.fillColor(S.colors.black).fontSize(S.address.valueSize);
      const svcMaxW = pageW - M - S.address.rightX;
      for (const line of svcLines) {
        const h = doc.heightOfString(line, { width: svcMaxW });
        const nLines = Math.max(1, Math.round(h / S.address.leading));
        doc.text(line, S.address.rightX,
          sy - (doc._font.ascender / 1000) * S.address.valueSize,
          { width: svcMaxW, lineBreak: true });
        sy += nLines * S.address.leading;
      }
    }

    /* -- line-item table (raised — starts just below addresses) --------- */

    const tableTop = Math.max(by, sy) + 12;
    let cursor = drawTableHeader(tableTop);

    doc.font('reg').fontSize(S.table.bodySize).fillColor(S.colors.black);
    const descW = S.table.colDesc.maxX - S.table.colDesc.textX;

    const newPageForRows = () => {
      doc.addPage();
      drawPageHeader();
      cursor = drawTableHeader(S.table.contPageTableTop);
      doc.font('reg').fontSize(S.table.bodySize).fillColor(S.colors.black);
    };

    // service date row (spans table, like QBO)
    // exact 13.5pt leading: pdfkit line height includes the font's line gap
    const bodyLineGap = S.table.leading - doc.currentLineHeight(true);

    if (data.serviceDate) {
      cursor += S.table.serviceDateGap;
      textAtBaseline(data.serviceDate, S.table.colDesc.textX, cursor + S.table.firstBaselineDy);
      cursor += S.table.leading;
    }

    for (const line of data.lines) {
      cursor += S.table.rowGap;
      const descHeight = doc.heightOfString(line.description || '', {
        width: descW, lineGap: bodyLineGap,
      });
      const rowLines = Math.max(1, Math.round(descHeight / S.table.leading));
      const rowH = rowLines * S.table.leading;

      // If the row won't fit, jump to next page so description + totals never clip
      if (cursor + Math.min(rowH, S.table.leading) > footerBottomLimit) newPageForRows();

      // Split very long descriptions across pages
      let remainingDesc = String(line.description || '');
      let firstChunk = true;
      while (true) {
        const room = footerBottomLimit - (cursor + S.table.firstBaselineDy);
        const maxLinesHere = Math.max(1, Math.floor(room / S.table.leading));
        const maxH = maxLinesHere * S.table.leading;

        // Measure full remaining
        const fullH = doc.heightOfString(remainingDesc, { width: descW, lineGap: bodyLineGap });
        const fitsFully = fullH <= maxH + 1;

        const firstBaseline = cursor + S.table.firstBaselineDy;
        if (fitsFully) {
          doc.text(remainingDesc, S.table.colDesc.textX,
            firstBaseline - (doc._font.ascender / 1000) * S.table.bodySize, {
              width: descW,
              lineGap: bodyLineGap,
            });
          if (firstChunk) {
            rightText(fmtMoney(line.rate), S.table.colRate.rightX, firstBaseline);
            rightText(fmtQty(line.qty), S.table.colQty.rightX, firstBaseline);
            rightText(fmtMoney(line.amount), S.table.colAmt.rightX, firstBaseline);
          }
          cursor += Math.max(S.table.leading, Math.round(fullH / S.table.leading) * S.table.leading);
          break;
        }

        // Truncate to what fits on this page via progressive character budget
        // (pdfkit doesn't expose line-break indices; approximate by height).
        let cut = Math.floor(remainingDesc.length * (maxH / Math.max(fullH, 1)));
        cut = Math.max(1, Math.min(remainingDesc.length - 1, cut));
        // Prefer break at whitespace near cut
        let breakAt = remainingDesc.lastIndexOf(' ', cut);
        if (breakAt < cut * 0.5) breakAt = cut;
        const chunk = remainingDesc.slice(0, breakAt).trimEnd();
        const rest = remainingDesc.slice(breakAt).trimStart();

        doc.text(chunk, S.table.colDesc.textX,
          firstBaseline - (doc._font.ascender / 1000) * S.table.bodySize, {
            width: descW,
            lineGap: bodyLineGap,
          });
        if (firstChunk) {
          rightText(fmtMoney(line.rate), S.table.colRate.rightX, firstBaseline);
          rightText(fmtQty(line.qty), S.table.colQty.rightX, firstBaseline);
          rightText(fmtMoney(line.amount), S.table.colAmt.rightX, firstBaseline);
          firstChunk = false;
        }
        if (!rest) {
          cursor += maxH;
          break;
        }
        remainingDesc = rest;
        newPageForRows();
        cursor += S.table.rowGap;
      }
    }

    /* -- totals + message block --------------------------------------- */

    let totalsTop = cursor + S.totals.ruleGapAboveY;
    if (totalsTop + 120 > footerBottomLimit) { newPageForRows(); totalsTop = cursor + S.totals.ruleGapAboveY; }

    dottedRule(M, M + S.table.w, totalsTop);

    // gray message block — payment options left of totals; thank-you / sincerely
    // drawn BELOW Balance Due with breathing room (Levi 2026-07-21).
    let paymentMsg = null;
    let closingMsg = null;
    if (data.messageLines !== null) {
      const msg = [...(data.messageLines || [
        `Your ${docType.toLowerCase()} is attached.`,
        'Thank you for your interest in our business - we appreciate it very much.',
        '',
        'Sincerely,',
        data.company.name,
      ])];
      const thanksIdx = msg.findIndex((l) => /Thank you for your business/i.test(String(l || '')));
      if (thanksIdx >= 0) {
        paymentMsg = msg.slice(0, thanksIdx).filter((l, i, a) => !(l === '' && i === a.length - 1));
        closingMsg = msg.slice(thanksIdx);
      } else {
        paymentMsg = msg;
        closingMsg = [];
      }
      doc.font('reg').fontSize(S.message.size).fillColor(S.colors.gray);
      const msgGap = S.message.leading - doc.currentLineHeight(true);
      let my = totalsTop + 22.5;
      for (const lineTxt of paymentMsg) {
        if (lineTxt === '') { my += S.message.leading; continue; }
        const h = doc.heightOfString(lineTxt, { width: S.message.maxW, lineGap: msgGap });
        const nLines = Math.max(1, Math.round(h / S.message.leading));
        doc.text(lineTxt, S.message.x,
          my - (doc._font.ascender / 1000) * S.message.size,
          { width: S.message.maxW, lineGap: msgGap });
        my += nLines * S.message.leading;
      }
    }

    // SUBTOTAL / TAX / optional PAYMENT
    doc.font('reg').fontSize(S.totals.labelSize);
    let ty = totalsTop + 22.5;
    const payment = Number(data.payment || 0);
    const totalRows = [['SUBTOTAL', fmtMoney(subtotal)], ['TAX', fmtMoney(tax)]];
    if (payment) totalRows.push(['PAYMENT', '-' + fmtMoney(payment)]);
    for (const [label, value] of totalRows) {
      doc.fillColor(S.colors.gray);
      textAtBaseline(label, S.totals.labelX, ty);
      doc.fillColor(S.colors.black);
      rightText(value, S.totals.amtRightX, ty);
      ty += S.totals.leading;
    }

    // rule above TOTAL (right side only)
    const totalRuleY = ty - S.totals.leading + 10.5;
    dottedRule(S.totals.totalRuleX, M + S.table.w, totalRuleY);

    ty += S.totals.totalGap;
    // QBO shows "TOTAL" on estimates and "BALANCE DUE" on invoices
    const bigLabel = data.totalLabel || (isEstimate ? 'TOTAL' : 'BALANCE DUE');
    const bigAmount = payment ? total - payment : total;
    doc.fillColor(S.colors.gray).fontSize(S.totals.labelSize);
    textAtBaseline(bigLabel, S.totals.labelX, ty);
    doc.font('bold').fontSize(S.totals.totalAmtSize).fillColor(S.colors.black);
    rightText('$' + fmtMoney(bigAmount), S.totals.amtRightX, ty);
    doc.font('reg');

    // Thank-you / sincerely — below Balance Due with a clear gap
    if (closingMsg && closingMsg.length) {
      doc.font('reg').fontSize(S.message.size).fillColor(S.colors.gray);
      const msgGap = S.message.leading - doc.currentLineHeight(true);
      let my = ty + 28;
      for (const lineTxt of closingMsg) {
        if (lineTxt === '') { my += S.message.leading; continue; }
        const h = doc.heightOfString(lineTxt, { width: S.message.maxW, lineGap: msgGap });
        const nLines = Math.max(1, Math.round(h / S.message.leading));
        doc.text(lineTxt, S.message.x,
          my - (doc._font.ascender / 1000) * S.message.size,
          { width: S.message.maxW, lineGap: msgGap });
        my += nLines * S.message.leading;
      }
    }

    // acceptance block (estimates)
    const showAcceptance = data.showAcceptance != null ? data.showAcceptance : isEstimate;
    if (showAcceptance) {
      doc.fontSize(S.acceptance.size).fillColor(S.colors.gray);
      textAtBaseline('Accepted By', M, ty + S.acceptance.gap1 + 9);
      textAtBaseline('Accepted Date', M, ty + S.acceptance.gap1 + 9 + S.acceptance.gap2);
    }

    /* -- footers on all pages ------------------------------------------ */

    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(i);
      drawFooter(i + 1, range.count);
    }

    doc.end();
  });
}

module.exports = { generateDocument, STYLE };
