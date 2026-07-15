// Requisition -> editable spreadsheet export (SpreadsheetML 2003 .xls).
// Dependency-free. Produces a real workbook with two worksheets (G702 summary
// and G703 continuation) that opens natively in Excel/Numbers and imports
// cleanly into Google Sheets — so the requisition can be edited as a sheet.

function xmlEsc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cell(value, { type = "String", style } = {}) {
  const s = style ? ` ss:StyleID="${style}"` : "";
  const t = type === "Number" ? "Number" : "String";
  const v = type === "Number" ? Number(value) || 0 : xmlEsc(value);
  return `<Cell${s}><Data ss:Type="${t}">${v}</Data></Cell>`;
}
function num(value, style = "money") {
  return cell(value, { type: "Number", style });
}
function row(cells) {
  return `<Row>${cells.join("")}</Row>`;
}
function blankRow() {
  return "<Row></Row>";
}

function g702Sheet(project, req) {
  const contractSum = Number(req.originalContractSum != null ? req.originalContractSum : project.contractSum) || 0;
  const contractToDate = Number(req.contractSumToDate) || contractSum;
  const changeOrders = Math.round((contractToDate - contractSum) * 100) / 100;
  const rows = [
    row([cell("APPLICATION AND CERTIFICATE FOR PAYMENT (AIA G702)", { style: "title" })]),
    row([cell("LE Electrical", { style: "bold" })]),
    blankRow(),
    row([cell("Project"), cell(project.name || "")]),
    row([cell("Location"), cell(project.address || "")]),
    row([cell("To (Owner)"), cell(project.gc || "")]),
    row([cell("From (Contractor)"), cell("LE Electrical")]),
    row([cell("Application No"), cell(req.applicationNumber || `REQ-${req.num || ""}`)]),
    row([cell("Period To"), cell(req.periodTo || "")]),
    blankRow(),
    row([cell("Line", { style: "hdr" }), cell("Description", { style: "hdr" }), cell("Amount", { style: "hdr" })]),
    row([cell("1"), cell("Original Contract Sum"), num(contractSum)]),
    row([cell("2"), cell("Net Change by Change Orders"), num(changeOrders)]),
    row([cell("3"), cell("Contract Sum to Date (1 +/- 2)"), num(contractToDate)]),
    row([cell("4"), cell("Total Completed & Stored to Date"), num(req.totalCompleted)]),
    row([cell("5"), cell(`Retainage ${req.retainagePct || 10}%`), num(req.totalRetainage)]),
    row([cell("6"), cell("Total Earned Less Retainage (4 - 5)"), num(req.earnedLessRetainage)]),
    row([cell("7"), cell("Less Previous Certificates for Payment"), num(req.previousCertificates)]),
    row([cell("8", { style: "bold" }), cell("CURRENT PAYMENT DUE (6 - 7)", { style: "bold" }), num(req.currentPaymentDue, "moneyBold")]),
    row([cell("9"), cell("Balance to Finish, Plus Retainage (3 - 6)"), num(req.balanceToFinish)]),
  ];
  return `<Worksheet ss:Name="G702"><Table>${rows.join("")}</Table></Worksheet>`;
}

function g703Sheet(req) {
  const header = row([
    cell("Item", { style: "hdr" }),
    cell("Description of Work", { style: "hdr" }),
    cell("Scheduled Value", { style: "hdr" }),
    cell("From Previous Application", { style: "hdr" }),
    cell("This Period", { style: "hdr" }),
    cell("Total Comp Completed", { style: "hdr" }),
    cell("%", { style: "hdr" }),
    cell("Balance to Finish", { style: "hdr" }),
    cell("Retainage", { style: "hdr" }),
  ]);
  const body = (req.g703 || []).map((r) =>
    row([
      cell(r.itemNo),
      cell(r.description),
      num(r.scheduledValue),
      num(r.prevCompleted),
      num(r.thisPeriod),
      num(r.totalCompleted),
      cell(`${Math.round(Number(r.pctComplete) || 0)}%`),
      num(r.balance),
      num(r.retainage),
    ])
  );
  const t = (req.g703 || []).reduce(
    (a, r) => ({
      scheduledValue: a.scheduledValue + (Number(r.scheduledValue) || 0),
      prevCompleted: a.prevCompleted + (Number(r.prevCompleted) || 0),
      thisPeriod: a.thisPeriod + (Number(r.thisPeriod) || 0),
      totalCompleted: a.totalCompleted + (Number(r.totalCompleted) || 0),
      balance: a.balance + (Number(r.balance) || 0),
      retainage: a.retainage + (Number(r.retainage) || 0),
    }),
    { scheduledValue: 0, prevCompleted: 0, thisPeriod: 0, totalCompleted: 0, balance: 0, retainage: 0 }
  );
  const totals = row([
    cell(""),
    cell("GRAND TOTALS", { style: "bold" }),
    num(t.scheduledValue, "moneyBold"),
    num(t.prevCompleted, "moneyBold"),
    num(t.thisPeriod, "moneyBold"),
    num(t.totalCompleted, "moneyBold"),
    cell(""),
    num(t.balance, "moneyBold"),
    num(t.retainage, "moneyBold"),
  ]);
  return `<Worksheet ss:Name="G703"><Table>${header}${body.join("")}${totals}</Table></Worksheet>`;
}

export function buildRequisitionWorkbookXml(project, req) {
  return (
    '<?xml version="1.0"?>\n<?mso-application progid="Excel.Sheet"?>\n' +
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"' +
    ' xmlns:o="urn:schemas-microsoft-com:office:office"' +
    ' xmlns:x="urn:schemas-microsoft-com:office:excel"' +
    ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">' +
    "<Styles>" +
    '<Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Bottom"/></Style>' +
    '<Style ss:ID="title"><Font ss:Bold="1" ss:Size="14"/></Style>' +
    '<Style ss:ID="bold"><Font ss:Bold="1"/></Style>' +
    '<Style ss:ID="hdr"><Font ss:Bold="1"/><Interior ss:Color="#E6E6E6" ss:Pattern="Solid"/></Style>' +
    '<Style ss:ID="money"><NumberFormat ss:Format="#,##0.00"/></Style>' +
    '<Style ss:ID="moneyBold"><Font ss:Bold="1"/><NumberFormat ss:Format="#,##0.00"/></Style>' +
    "</Styles>" +
    g702Sheet(project, req) +
    g703Sheet(req) +
    "</Workbook>"
  );
}

export function buildRequisitionExcel(project, req) {
  const xml = buildRequisitionWorkbookXml(project, req);
  return new Blob([new TextEncoder().encode(xml)], { type: "application/vnd.ms-excel" });
}

export function downloadRequisitionExcel(project, req) {
  const blob = buildRequisitionExcel(project, req);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${req.applicationNumber || "requisition"}.xls`;
  a.click();
  URL.revokeObjectURL(url);
}
