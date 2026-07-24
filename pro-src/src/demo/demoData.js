// Synthetic dataset for the white-label TEST TENANT (demo mode).
//
// EVERYTHING here is invented. There is not one real customer, phone number,
// email, address or dollar figure from any production tenant. The demo company
// is a fictional plumber ("Ace Plumbing Co.", Austin TX) chosen to be visibly
// distinct from LE Electrical / BLZ Electric so nobody can confuse the two.
//
// The demo backend (demoBackend.js) serves these shapes in response to the
// same /.netlify/functions/* calls the real adapter makes, so the whole app
// renders — Customers, Invoices, Estimates, Payments, Reminders, Calendar,
// Requisitions, Reports — off this seed alone.

// Dates are computed RELATIVE to the day the demo is opened, so the seed never
// looks stale — invoices stay "recent", the site visit stays "upcoming", no
// matter when someone loads the demo months from now.
function ymd(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}
const D = {
  today: ymd(0),
  soon: ymd(4),
  soon2: ymd(8),
  lastWeek: ymd(-7),
  lastMonth: ymd(-30),
  older: ymd(-45),
};

/* ────────────────────────────── brand logo ────────────────────────────── */

// Self-contained SVG wordmark for the demo tenant, so the white-label showcase
// carries the COMPANY's brand (Ace Plumbing) — not the LE monogram — on the
// lock screen, the sidebar and document headers. It renders before any settings
// fetch resolves, so demoBackend seeds it synchronously via setCompanyLogoDataUrl.
// A white rounded card keeps it legible on BOTH the dark lock screen and the
// light app chrome. No external asset (CSP-safe, offline, never goes stale).
export function demoBrandLogo() {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 100">' +
    '<rect x="2" y="10" width="296" height="80" rx="18" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>' +
    '<path d="M46 26 C46 26 66 52 66 68 A20 20 0 0 1 26 68 C26 52 46 26 46 26 Z" fill="#1d4ed8"/>' +
    '<path d="M46 43 C46 43 57 57 57 66 A11 11 0 0 1 35 66 C35 57 46 43 46 43 Z" fill="#93c5fd"/>' +
    '<text x="86" y="53" font-family="Helvetica,Arial,sans-serif" font-size="30" font-weight="800" fill="#0f172a">Ace Plumbing</text>' +
    '<text x="87" y="77" font-family="Helvetica,Arial,sans-serif" font-size="14" font-weight="700" fill="#1d4ed8" letter-spacing="2">CO.  ·  AUSTIN, TX</text>' +
    "</svg>";
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

/* ────────────────────────────── tenant config ─────────────────────────── */

// White-label company identity. internal:false (an ordinary tenant — no dev
// tooling), plan "full" + crewAddon so EVERY feature module is on for testing.
export function demoTenant() {
  return {
    tenantId: "demo",
    internal: false,
    plan: { tier: "full", crewAddon: true },
    branding: {
      companyName: "Ace Plumbing Co.",
      logoUrl: demoBrandLogo(),
      primaryColor: "#1d4ed8", // blue — deliberately not LE's green
      letterheadTemplate: "default",
      supportEmail: "office@aceplumbing.example",
    },
    moduleOverrides: {},
    agencies: [
      { id: "austin_dev", label: "Austin Dev Services" },
      { id: "austin_water", label: "Austin Water" },
    ],
    // Product brand stays the platform default ("LE Pro" / "Powered by LE") —
    // this demo shows a tenant COMPANY, not a product rename.
    product: {},
  };
}

export function demoProfile() {
  return {
    companyName: "Ace Plumbing Co.",
    license: "TX MPL #45521",
    street: "1140 Guadalupe St, Suite 5",
    cityStateZip: "Austin, TX 78701",
    phone: "(512) 555-0142",
    email: "office@aceplumbing.example",
    brandColor: "#1d4ed8",
    logoDataUrl: demoBrandLogo(),
    paymentMethods: { card: true, zelle: true, check: true },
    zelleInstructions: "Zelle: Send payment to office@aceplumbing.example.",
    checkInstructions:
      'Check: Make checks payable to "Ace Plumbing Co." and mail to 1140 Guadalupe St, Suite 5, Austin, TX 78701.',
    payLinkBase: "https://pay.aceplumbing.example/demo",
    emailFrom: "billing@aceplumbing.example",
    defaultTerms: "Net 30",
    taxRate: 8.25,
    invoiceStart: "1000",
    estimateStart: "2000",
    calendarAccount: "office@aceplumbing.example",
    shortName: "Ace Plumbing",
    requisition: {
      companyName: "Ace Plumbing Co.",
      license: "TX MPL #45521",
      street: "1140 Guadalupe St, Suite 5",
      cityStateZip: "Austin, TX 78701",
      phone: "(512) 555-0142",
    },
  };
}

export function demoFeatures() {
  return {
    requisitions: true,
    timeTracking: true,
    changeOrders: true,
    estimates: true,
    statements: true,
    letterhead: true,
    quickbooks: true,
    calendar: true,
    reminders: true,
    progressDashboard: true,
    subCompanies: true,
    paymentCard: true,
    paymentZelle: true,
    paymentCheck: true,
    aiFeatures: true,
    speechToText: true,
  };
}

export function demoSettings() {
  return {
    profile: demoProfile(),
    features: demoFeatures(),
    tenant: demoTenant(),
    updatedAt: 1,
    ts: 1,
  };
}

/* ─────────────────────────────── helpers ──────────────────────────────── */

function done(stages, extra = {}) {
  const status = {};
  for (const s of stages) status[s] = { s: "done" };
  return { ...status, ...extra };
}

/* ──────────────────────────────── jobs ────────────────────────────────── */
//
// Base "QuickBooks-synced" jobs. Customers are DERIVED from these by the app
// (grouped by name), so this one list drives the Customers board, the invoice
// and estimate ledgers, payments, reminders and the Company/Reports numbers.

export function demoJobs() {
  return [
    // 1) Paid residential water-heater install (card payment on file).
    {
      id: "job-1001",
      customer: "John Rivera",
      businessName: "",
      personName: "John Rivera",
      title: "40-gal water heater replacement",
      amount: 2400,
      phone: "(512) 555-0111",
      email: "john.rivera@example.com",
      address: "3208 Oak Springs Dr, Austin, TX 78702",
      serviceAddress: "3208 Oak Springs Dr, Austin, TX 78702",
      billingAddress: "3208 Oak Springs Dr, Austin, TX 78702",
      apartment: "",
      estimateNo: "2011",
      invoiceNo: "1001",
      paid: true,
      notes: "Old unit leaking. Replaced with 40-gal, hauled away old tank.",
      attachments: [],
      invoiceHistory: [{ no: "1001", date: D.lastWeek, amount: 2400 }],
      followUp: null,
      calEventId: "",
      openBalance: 0,
      payments: [
        {
          id: "demopay-1001a",
          amount: 2400,
          method: "Card",
          date: D.lastWeek,
          ref: "AUTH-4471",
          invoiceNo: "1001",
          jobId: "job-1001",
        },
      ],
      status: done(["Lead", "Site Visit", "Estimate", "Accepted", "Invoiced", "Scheduled", "Done", "Follow-up", "Paid"]),
    },

    // 2) Commercial re-pipe — accepted estimate, invoiced, PARTIALLY paid.
    {
      id: "job-1002",
      customer: "Blue Ridge Cafe",
      businessName: "Blue Ridge Cafe",
      personName: "Maria Delgado",
      title: "Kitchen re-pipe (hot & cold supply lines)",
      amount: 8500,
      phone: "(512) 555-0122",
      email: "maria@blueridgecafe.example",
      address: "918 E 6th St, Austin, TX 78702",
      serviceAddress: "918 E 6th St, Austin, TX 78702",
      billingAddress: "918 E 6th St, Austin, TX 78702",
      apartment: "",
      estimateNo: "2012",
      invoiceNo: "1002",
      paid: false,
      notes: "Accepted 7/12. 50% deposit received. Balance due on completion.",
      attachments: [],
      invoiceEmailStatus: "emailsent",
      invoiceHistory: [
        { no: "1002", date: D.lastWeek, amount: 8500 },
        { kind: "Estimate #2012 emailed", no: "2012", date: D.lastMonth },
        { kind: "Invoice #1002 emailed", no: "1002", date: D.lastWeek },
      ],
      followUp: {
        type: "Payment / collect",
        date: D.soon,
        text: "Collect remaining $4,250 balance after final walkthrough.",
        done: false,
      },
      calEventId: "evt-1002",
      openBalance: 4250,
      paymentBaseline: 8500,
      payments: [
        {
          id: "demopay-1002a",
          amount: 4250,
          method: "Check",
          date: D.lastWeek,
          ref: "CHK-2098",
          invoiceNo: "1002",
          jobId: "job-1002",
        },
      ],
      status: done(["Lead", "Site Visit", "Estimate", "Accepted", "Invoiced", "Deposit Receipt"], {
        Scheduled: { s: "current" },
      }),
    },

    // 3) Property-management leak repair — invoiced, UNPAID, payment reminder.
    {
      id: "job-1003",
      customer: "Maple Street Apartments",
      businessName: "Maple Street Apartments",
      personName: "Property Manager",
      title: "Unit 4B — under-sink leak repair",
      amount: 650,
      phone: "(512) 555-0133",
      email: "manager@maplestreetapts.example",
      address: "77 Maple St, Austin, TX 78704",
      serviceAddress: "77 Maple St, Austin, TX 78704",
      billingAddress: "77 Maple St, Austin, TX 78704",
      apartment: "4B",
      estimateNo: "",
      invoiceNo: "1003",
      paid: false,
      notes: "Replaced P-trap and shutoff valve. Net 30.",
      attachments: [],
      invoiceEmailStatus: "emailsent",
      invoiceHistory: [
        { no: "1003", date: D.lastMonth, amount: 650 },
        { kind: "Invoice #1003 emailed", no: "1003", date: D.lastMonth },
      ],
      followUp: {
        type: "Payment / collect",
        date: D.today,
        text: "Invoice 1003 is past due — send a payment reminder.",
        done: false,
      },
      calEventId: "",
      openBalance: 650,
      payments: [],
      status: done(["Lead", "Site Visit", "Invoiced", "Scheduled", "Done"], {
        "Follow-up": { s: "current" },
      }),
    },

    // 4) Estimate awaiting acceptance — acceptance reminder.
    {
      id: "job-1004",
      customer: "Sarah Kim",
      businessName: "",
      personName: "Sarah Kim",
      title: "Master bath remodel — rough & finish plumbing",
      amount: 5200,
      phone: "(512) 555-0144",
      email: "sarah.kim@example.com",
      address: "1450 Barton Springs Rd, Austin, TX 78704",
      serviceAddress: "1450 Barton Springs Rd, Austin, TX 78704",
      billingAddress: "1450 Barton Springs Rd, Austin, TX 78704",
      apartment: "",
      estimateNo: "2013",
      invoiceNo: "",
      paid: false,
      notes: "Sent estimate 7/18. Following up for acceptance.",
      attachments: [],
      invoiceHistory: [{ kind: "Estimate #2013 emailed", no: "2013", date: "2026-07-18" }],
      followUp: {
        type: "Acceptance",
        date: D.soon,
        text: "Follow up on estimate 2013 acceptance.",
        done: false,
      },
      calEventId: "",
      openBalance: "",
      payments: [],
      status: done(["Lead", "Site Visit", "Estimate"], { Accepted: { s: "current" } }),
    },

    // 5) Emergency drain — small, paid same day (Zelle).
    {
      id: "job-1005",
      customer: "Tom Bishop",
      businessName: "",
      personName: "Tom Bishop",
      title: "Emergency main drain clog",
      amount: 320,
      phone: "(512) 555-0155",
      email: "tom.bishop@example.com",
      address: "612 W 34th St, Austin, TX 78705",
      serviceAddress: "612 W 34th St, Austin, TX 78705",
      billingAddress: "612 W 34th St, Austin, TX 78705",
      apartment: "",
      estimateNo: "",
      invoiceNo: "1004",
      paid: true,
      notes: "After-hours call. Cleared main line from cleanout.",
      attachments: [],
      invoiceHistory: [{ no: "1004", date: D.older, amount: 320 }],
      followUp: null,
      calEventId: "",
      openBalance: 0,
      payments: [
        {
          id: "demopay-1005a",
          amount: 320,
          method: "Zelle",
          date: D.older,
          ref: "ZL-8841",
          invoiceNo: "1004",
          jobId: "job-1005",
        },
      ],
      status: done(["Lead", "Invoiced", "Scheduled", "Done", "Follow-up", "Paid"]),
    },

    // 6) Upcoming scheduled site visit — new lead (for Calendar / Today).
    {
      id: "job-1006",
      customer: "Downtown Lofts LLC",
      businessName: "Downtown Lofts LLC",
      personName: "Grant Whitmore",
      title: "Site visit — commercial restroom rough-in bid",
      amount: 0,
      phone: "(512) 555-0166",
      email: "grant@downtownlofts.example",
      address: "220 Congress Ave, Austin, TX 78701",
      serviceAddress: "220 Congress Ave, Austin, TX 78701",
      billingAddress: "220 Congress Ave, Austin, TX 78701",
      apartment: "",
      estimateNo: "",
      invoiceNo: "",
      paid: false,
      notes: "New GC lead — 12-unit loft conversion. Requisition project set up.",
      attachments: [],
      invoiceHistory: [],
      followUp: {
        type: "Schedule the job",
        date: D.soon2,
        text: "Confirm site-visit window with Grant.",
        done: false,
      },
      calEventId: "evt-1006",
      openBalance: 0,
      payments: [],
      status: { Lead: { s: "done" }, "Site Visit": { s: "current" } },
    },

    /* ══════════════════════════════════════════════════════════════════════
       SCENARIO A — PARENT management company + SUB-COMPANY LLCs.
       "Skyline Property Group" (qboCustomerId "P1") is the management company;
       each building LLC bills under it via parentCustomerName/parentQboCustomerId.
       Sub #1 also carries TWO service addresses (multi-address under one sub)
       and an invoice-side CHANGE ORDER, so all three test scenarios interlock.
       ══════════════════════════════════════════════════════════════════════ */

    // 7) PARENT — Skyline Property Group (management co, its own retainer invoice).
    {
      id: "job-2001",
      customer: "Skyline Property Group",
      businessName: "Skyline Property Group",
      personName: "Dana Fowler",
      qboCustomerId: "P1",
      title: "Portfolio annual backflow testing — retainer",
      amount: 1800,
      phone: "(512) 555-0210",
      email: "dana@skylinepg.example",
      address: "98 San Jacinto Blvd, Austin, TX 78701",
      serviceAddress: "98 San Jacinto Blvd, Austin, TX 78701",
      billingAddress: "98 San Jacinto Blvd, Austin, TX 78701",
      apartment: "",
      estimateNo: "",
      invoiceNo: "1010",
      paid: false,
      notes: "Management company. Bills for the whole Skyline portfolio.",
      attachments: [],
      invoiceEmailStatus: "emailsent",
      invoiceHistory: [{ no: "1010", date: D.lastWeek, amount: 1800 }],
      followUp: null,
      calEventId: "",
      openBalance: 1800,
      payments: [],
      status: done(["Lead", "Invoiced", "Scheduled", "Done"], { "Follow-up": { s: "current" } }),
    },

    // 8) SUB #1 — Skyline Downtown LLC, service address #1 (500 Congress). Invoiced, partial paid.
    {
      id: "job-2002",
      customer: "Skyline Downtown LLC",
      businessName: "Skyline Downtown LLC",
      personName: "Dana Fowler",
      qboCustomerId: "S1",
      parentCustomerName: "Skyline Property Group",
      parentQboCustomerId: "P1",
      title: "Lobby restroom re-pipe",
      amount: 6200,
      phone: "(512) 555-0211",
      email: "downtown@skylinepg.example",
      address: "500 Congress Ave, Austin, TX 78701",
      serviceAddress: "500 Congress Ave, Austin, TX 78701",
      billingAddress: "98 San Jacinto Blvd, Austin, TX 78701",
      apartment: "",
      estimateNo: "2020",
      invoiceNo: "1011",
      paid: false,
      notes: "Bills under Skyline Property Group. 50% deposit received.",
      attachments: [],
      invoiceEmailStatus: "emailsent",
      invoiceHistory: [
        { no: "1011", date: D.lastWeek, amount: 6200 },
        { kind: "Invoice #1011 emailed", no: "1011", date: D.lastWeek },
      ],
      followUp: {
        type: "Payment / collect",
        date: D.soon,
        text: "Collect remaining $3,100 on the lobby re-pipe.",
        done: false,
      },
      calEventId: "",
      openBalance: 3100,
      paymentBaseline: 6200,
      payments: [
        { id: "demopay-1011a", amount: 3100, method: "Check", date: D.lastWeek, ref: "CHK-3310", invoiceNo: "1011", jobId: "job-2002" },
      ],
      status: done(["Lead", "Site Visit", "Estimate", "Accepted", "Invoiced", "Deposit Receipt"], { Scheduled: { s: "current" } }),
    },

    // 8a) CHANGE ORDER #1 off invoice 1011 (invoice-side CO — its own numbered invoice).
    {
      id: "job-2002-co1",
      customer: "Skyline Downtown LLC",
      businessName: "Skyline Downtown LLC",
      personName: "Dana Fowler",
      qboCustomerId: "S1",
      parentCustomerName: "Skyline Property Group",
      parentQboCustomerId: "P1",
      changeOrder: true,
      changeOrderKind: "invoice",
      changeOrderSourceId: "job-2002",
      changeOrderSeq: 1,
      changeOrderLabel: "1011-CO-01",
      title: "Change Order 1 — add ADA fixture set + grab bars",
      amount: 1450,
      phone: "(512) 555-0211",
      email: "downtown@skylinepg.example",
      address: "500 Congress Ave, Austin, TX 78701",
      serviceAddress: "500 Congress Ave, Austin, TX 78701",
      billingAddress: "98 San Jacinto Blvd, Austin, TX 78701",
      apartment: "",
      estimateNo: "",
      invoiceNo: "1011-CO-01",
      paid: false,
      notes: "Owner-requested ADA upgrade during rough-in.",
      attachments: [],
      invoiceHistory: [{ no: "1011-CO-01", date: D.lastWeek, amount: 1450 }],
      followUp: null,
      calEventId: "",
      openBalance: 1450,
      payments: [],
      status: done(["Lead", "Invoiced"], { Scheduled: { s: "current" } }),
    },

    // 8b) CHANGE ORDER #2 off invoice 1011.
    {
      id: "job-2002-co2",
      customer: "Skyline Downtown LLC",
      businessName: "Skyline Downtown LLC",
      personName: "Dana Fowler",
      qboCustomerId: "S1",
      parentCustomerName: "Skyline Property Group",
      parentQboCustomerId: "P1",
      changeOrder: true,
      changeOrderKind: "invoice",
      changeOrderSourceId: "job-2002",
      changeOrderSeq: 2,
      changeOrderLabel: "1011-CO-02",
      title: "Change Order 2 — reroute vent around new duct",
      amount: 900,
      phone: "(512) 555-0211",
      email: "downtown@skylinepg.example",
      address: "500 Congress Ave, Austin, TX 78701",
      serviceAddress: "500 Congress Ave, Austin, TX 78701",
      billingAddress: "98 San Jacinto Blvd, Austin, TX 78701",
      apartment: "",
      estimateNo: "",
      invoiceNo: "1011-CO-02",
      paid: true,
      notes: "Field change to clear mechanical duct.",
      attachments: [],
      invoiceHistory: [{ no: "1011-CO-02", date: D.lastWeek, amount: 900 }],
      followUp: null,
      calEventId: "",
      openBalance: 0,
      payments: [
        { id: "demopay-co2", amount: 900, method: "Check", date: D.lastWeek, ref: "CHK-3311", invoiceNo: "1011-CO-02", jobId: "job-2002-co2" },
      ],
      status: done(["Lead", "Invoiced", "Done", "Paid"]),
    },

    // 9) SUB #1 second service address (512 Congress) — multi-address under one company.
    {
      id: "job-2003",
      customer: "Skyline Downtown LLC",
      businessName: "Skyline Downtown LLC",
      personName: "Dana Fowler",
      qboCustomerId: "S1",
      parentCustomerName: "Skyline Property Group",
      parentQboCustomerId: "P1",
      title: "Garage level — trench drain replacement",
      amount: 3400,
      phone: "(512) 555-0211",
      email: "downtown@skylinepg.example",
      address: "512 Congress Ave, Austin, TX 78701",
      serviceAddress: "512 Congress Ave, Austin, TX 78701",
      billingAddress: "98 San Jacinto Blvd, Austin, TX 78701",
      apartment: "",
      estimateNo: "",
      invoiceNo: "1012",
      paid: false,
      notes: "Second Skyline Downtown site — parking structure.",
      attachments: [],
      invoiceEmailStatus: "emailsent",
      invoiceHistory: [{ no: "1012", date: D.lastMonth, amount: 3400 }],
      followUp: { type: "Payment / collect", date: D.today, text: "Invoice 1012 past due — send reminder.", done: false },
      calEventId: "",
      openBalance: 3400,
      payments: [],
      status: done(["Lead", "Site Visit", "Invoiced", "Scheduled", "Done"], { "Follow-up": { s: "current" } }),
    },

    // 10) SUB #2 — Skyline Eastside LLC, single site. Invoiced, paid (card).
    {
      id: "job-2004",
      customer: "Skyline Eastside LLC",
      businessName: "Skyline Eastside LLC",
      personName: "Dana Fowler",
      qboCustomerId: "S2",
      parentCustomerName: "Skyline Property Group",
      parentQboCustomerId: "P1",
      title: "Tenant unit — water heater swap",
      amount: 2100,
      phone: "(512) 555-0212",
      email: "eastside@skylinepg.example",
      address: "1200 E Cesar Chavez St, Austin, TX 78702",
      serviceAddress: "1200 E Cesar Chavez St, Austin, TX 78702",
      billingAddress: "98 San Jacinto Blvd, Austin, TX 78701",
      apartment: "3C",
      estimateNo: "",
      invoiceNo: "1013",
      paid: true,
      notes: "Second Skyline LLC. Bills under Skyline Property Group.",
      attachments: [],
      invoiceHistory: [{ no: "1013", date: D.lastWeek, amount: 2100 }],
      followUp: null,
      calEventId: "",
      openBalance: 0,
      payments: [
        { id: "demopay-1013a", amount: 2100, method: "Card", date: D.lastWeek, ref: "AUTH-5521", invoiceNo: "1013", jobId: "job-2004" },
      ],
      status: done(["Lead", "Invoiced", "Scheduled", "Done", "Follow-up", "Paid"]),
    },

    /* ══════════════════════════════════════════════════════════════════════
       SCENARIO B — ONE company, MULTIPLE service addresses (no parent/sub).
       Maple Street Apartments (existing job-1003 @ 77 Maple St) gains two more
       buildings, so its Addresses tab lists three distinct service addresses.
       ══════════════════════════════════════════════════════════════════════ */

    // 11) Maple Street Apartments — Building B (142 Cedar Ln).
    {
      id: "job-2005",
      customer: "Maple Street Apartments",
      businessName: "Maple Street Apartments",
      personName: "Property Manager",
      title: "Building B laundry — backflow + shutoff",
      amount: 780,
      phone: "(512) 555-0133",
      email: "manager@maplestreetapts.example",
      address: "142 Cedar Ln, Austin, TX 78704",
      serviceAddress: "142 Cedar Ln, Austin, TX 78704",
      billingAddress: "77 Maple St, Austin, TX 78704",
      apartment: "Bldg B",
      estimateNo: "",
      invoiceNo: "1014",
      paid: false,
      notes: "Same customer, different building. Net 30.",
      attachments: [],
      invoiceEmailStatus: "emailsent",
      invoiceHistory: [{ no: "1014", date: D.lastWeek, amount: 780 }],
      followUp: { type: "Payment / collect", date: D.soon2, text: "Follow up on invoice 1014.", done: false },
      calEventId: "",
      openBalance: 780,
      payments: [],
      status: done(["Lead", "Invoiced", "Scheduled", "Done"], { "Follow-up": { s: "current" } }),
    },

    // 12) Maple Street Apartments — Building C (210 Elm Ct). Paid.
    {
      id: "job-2006",
      customer: "Maple Street Apartments",
      businessName: "Maple Street Apartments",
      personName: "Property Manager",
      title: "Building C — main shutoff replacement",
      amount: 540,
      phone: "(512) 555-0133",
      email: "manager@maplestreetapts.example",
      address: "210 Elm Ct, Austin, TX 78704",
      serviceAddress: "210 Elm Ct, Austin, TX 78704",
      billingAddress: "77 Maple St, Austin, TX 78704",
      apartment: "Bldg C",
      estimateNo: "",
      invoiceNo: "1015",
      paid: true,
      notes: "Third Maple building. Paid by check.",
      attachments: [],
      invoiceHistory: [{ no: "1015", date: D.lastMonth, amount: 540 }],
      followUp: null,
      calEventId: "",
      openBalance: 0,
      payments: [
        { id: "demopay-1015a", amount: 540, method: "Check", date: D.lastMonth, ref: "CHK-7720", invoiceNo: "1015", jobId: "job-2006" },
      ],
      status: done(["Lead", "Invoiced", "Scheduled", "Done", "Follow-up", "Paid"]),
    },
  ];
}

/* ─────────────────────────── requisitions (SOV) ───────────────────────── */
//
// One commercial progress-billing project so the Requisitions tab has real
// content: a schedule of values with %-complete, tied to Downtown Lofts.

export function demoProjects() {
  const items = [
    { id: "item-1", section: "", description: "Underground sanitary & vent rough-in", value: 42000, contractPct: 0, completedPct: 100, retainageExempt: false },
    { id: "item-2", section: "", description: "Domestic water distribution", value: 38500, contractPct: 0, completedPct: 60, retainageExempt: false },
    { id: "item-3", section: "Fixtures", description: "Restroom fixture sets (12)", value: 27600, contractPct: 0, completedPct: 25, retainageExempt: false },
    { id: "item-4", section: "Equipment", description: "Water heater & recirculation pump", value: 15400, contractPct: 0, completedPct: 0, retainageExempt: true },
    { id: "item-5", section: "", description: "Gas piping to rooftop units", value: 18200, contractPct: 0, completedPct: 0, retainageExempt: false },
  ];
  const contractSum = items.reduce((s, it) => s + it.value, 0);
  return {
    list: [
      {
        id: "demo-project-1",
        name: "Downtown Lofts — Plumbing",
        address: "220 Congress Ave, Austin, TX 78701",
        companyName: "Ace Plumbing Co.",
        contractor: "Ace Plumbing Co.",
        gc: "WHITMORE CONSTRUCTION LLC",
        customerName: "Downtown Lofts LLC",
        customerKey: "downtown lofts llc",
        contractSum,
        retainagePct: 10,
        // Two approved change orders (net +$12,500). contractToDate auto-becomes
        // contractSum + changeOrders, and a "Change Orders (net)" G703 row appears.
        changeOrders: 12500,
        changeOrderList: [
          { id: "co-dl-1", seq: 1, description: "Added roof-drain leaders (3 risers)", amount: 8000, balance: 8000, date: D.lastMonth, invoiceNo: "CO-01", attachOnly: false },
          { id: "co-dl-2", seq: 2, description: "Relocate gas riser per GC RFI-14", amount: 4500, balance: 4500, date: D.lastWeek, invoiceNo: "CO-02", attachOnly: false },
        ],
        items,
        // No prior requisitions in the seed — the SOV + %-complete are set and
        // "Create requisition" works from a clean slate (a saved requisition
        // carries a much richer snapshot than a hand-authored stub would).
        requisitions: [],
        requisitionEnabled: true,
        driveLinks: [],
        jobId: "job-1006",
        createdAt: 1,
        updatedAt: 1,
      },
    ],
  };
}

/* ──────────────────────────── customer index ──────────────────────────── */
//
// QBO-style customer search index. Derived from the same fictional companies /
// people as the jobs, so New-Job search and the customer picker work.

export function demoCustomerIndex(q) {
  const all = [
    { id: "cust-1", name: "John Rivera", businessName: "", personName: "John Rivera", phone: "(512) 555-0111", email: "john.rivera@example.com", billingAddress: "3208 Oak Springs Dr, Austin, TX 78702" },
    { id: "cust-2", name: "Blue Ridge Cafe", businessName: "Blue Ridge Cafe", personName: "Maria Delgado", phone: "(512) 555-0122", email: "maria@blueridgecafe.example", billingAddress: "918 E 6th St, Austin, TX 78702" },
    { id: "cust-3", name: "Maple Street Apartments", businessName: "Maple Street Apartments", personName: "Property Manager", phone: "(512) 555-0133", email: "manager@maplestreetapts.example", billingAddress: "77 Maple St, Austin, TX 78704" },
    { id: "cust-4", name: "Sarah Kim", businessName: "", personName: "Sarah Kim", phone: "(512) 555-0144", email: "sarah.kim@example.com", billingAddress: "1450 Barton Springs Rd, Austin, TX 78704" },
    { id: "cust-5", name: "Tom Bishop", businessName: "", personName: "Tom Bishop", phone: "(512) 555-0155", email: "tom.bishop@example.com", billingAddress: "612 W 34th St, Austin, TX 78705" },
    { id: "cust-6", name: "Downtown Lofts LLC", businessName: "Downtown Lofts LLC", personName: "Grant Whitmore", phone: "(512) 555-0166", email: "grant@downtownlofts.example", billingAddress: "220 Congress Ave, Austin, TX 78701" },
    { id: "cust-7", name: "Skyline Property Group", businessName: "Skyline Property Group", personName: "Dana Fowler", qboCustomerId: "P1", phone: "(512) 555-0210", email: "dana@skylinepg.example", billingAddress: "98 San Jacinto Blvd, Austin, TX 78701" },
    { id: "cust-8", name: "Skyline Downtown LLC", businessName: "Skyline Downtown LLC", personName: "Dana Fowler", qboCustomerId: "S1", parentId: "P1", parentName: "Skyline Property Group", phone: "(512) 555-0211", email: "downtown@skylinepg.example", billingAddress: "98 San Jacinto Blvd, Austin, TX 78701" },
    { id: "cust-9", name: "Skyline Eastside LLC", businessName: "Skyline Eastside LLC", personName: "Dana Fowler", qboCustomerId: "S2", parentId: "P1", parentName: "Skyline Property Group", phone: "(512) 555-0212", email: "eastside@skylinepg.example", billingAddress: "98 San Jacinto Blvd, Austin, TX 78701" },
  ];
  const query = String(q || "").trim().toLowerCase();
  if (!query) return all;
  return all.filter((c) =>
    [c.name, c.personName, c.phone, c.email].some((v) => String(v || "").toLowerCase().includes(query))
  );
}

export function demoCustomer(id) {
  return demoCustomerIndex("").find((c) => c.id === String(id)) || null;
}

/* ─────────────────────────── products & services ──────────────────────── */

export function demoItems() {
  return [
    { name: "Service call:Standard", type: "Service", price: 95, description: "Standard service call (first hour)" },
    { name: "Service call:Emergency after-hours", type: "Service", price: 185, description: "Emergency after-hours call" },
    { name: "Water heater:40-gal install", type: "Service", price: 2400, description: "40-gallon water heater supplied & installed" },
    { name: "Water heater:Tankless install", type: "Service", price: 4200, description: "Tankless water heater install" },
    { name: "Drain:Main line clearing", type: "Service", price: 320, description: "Clear main sewer line from cleanout" },
    { name: "Repipe:Copper (per fixture)", type: "Service", price: 480, description: "Copper supply repipe per fixture" },
    { name: "Fixture:Toilet install", type: "Service", price: 260, description: "Supply & install standard toilet" },
    { name: "Fixture:Faucet install", type: "Service", price: 180, description: "Supply & install kitchen/bath faucet" },
    { name: "Permit:Plumbing permit filing", type: "Service", price: 350, description: "File plumbing permit with city" },
    { name: "Labor:Journeyman (per hour)", type: "Service", price: 125, description: "Journeyman plumber labor, hourly" },
  ];
}

/* ──────────────────────────────── calendar ────────────────────────────── */

export function demoEvents() {
  return [
    {
      id: "evt-1002",
      title: "Blue Ridge Cafe — re-pipe completion",
      start: D.soon + "T09:00:00",
      end: D.soon + "T13:00:00",
      description: "Job job-1002 — final connections + walkthrough.",
      location: "918 E 6th St, Austin, TX 78702",
    },
    {
      id: "evt-1006",
      title: "Downtown Lofts — site visit / bid",
      start: D.soon2 + "T14:00:00",
      end: D.soon2 + "T15:30:00",
      description: "Job job-1006 — commercial restroom rough-in bid.",
      location: "220 Congress Ave, Austin, TX 78701",
    },
  ];
}

/* ───────────────────────────── time tracking ──────────────────────────── */

export function demoTimeTrack() {
  return {
    employees: [
      { id: "emp-1", name: "Danny Cruz", role: "Journeyman", active: true },
      { id: "emp-2", name: "Priya Shah", role: "Apprentice", active: true },
    ],
    active: {},
    entries: [
      { id: "te-1", employeeId: "emp-1", jobId: "job-1002", date: D.lastWeek, hours: 6.5, note: "Re-pipe rough-in" },
      { id: "te-2", employeeId: "emp-2", jobId: "job-1002", date: D.lastWeek, hours: 6.5, note: "Assist re-pipe" },
      { id: "te-3", employeeId: "emp-1", jobId: "job-1001", date: D.lastWeek, hours: 3, note: "Water heater swap" },
    ],
    ts: 1,
  };
}
