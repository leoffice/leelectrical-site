/**
 * Default company profile + feature toggles for LE Pro Settings / white-label.
 *
 * NOTE ON THE VALUES BELOW: these are the LE Electrical tenant's seed, not
 * generic defaults. They are deliberately byte-identical to the literals that
 * used to be hard-coded in invoicePdf.js / jobToQbDoc.js / requisitionData.js
 * so that routing those call sites through tenant_config produces exactly the
 * same invoice, estimate and requisition output as before.
 *
 * Where a call site historically used DIFFERENT wording (the requisition
 * billing block names "LE Electrical" and a Suite 297 address; the four copies
 * of the payment-instruction text had drifted), that variant is preserved as
 * its own field rather than collapsed onto the shared one. Unifying them
 * changes customer-facing documents and belongs in its own reviewable change,
 * not in the config plumbing.
 */

export const DEFAULT_PROFILE = {
  companyName: "BLZ Electric Inc.",
  license: "Lic #11212",
  street: "383 Kingston Ave",
  cityStateZip: "Brooklyn, NY 11213",
  phone: "(718) 594-1850",
  email: "Office@LeElectrical.us",
  brandColor: "#2d8a3e",
  logoDataUrl: "",
  paymentMethods: { card: true, zelle: true, check: true },
  zelleInstructions: "Zelle: Send payment to Office@LeElectrical.us.",
  checkInstructions:
    'Check: Make checks payable to "BLZ Electric Inc." and either mail it or email a clear picture to Office@LeElectrical.us.',
  payLinkBase: "https://secure.cardknox.com/blzelectric",
  emailFrom: "payments@leelectrical.us",
  defaultTerms: "Net 30",
  taxRate: 0,
  invoiceStart: "",
  estimateStart: "",
  calendarAccount: "office@leelectrical.us",

  // Short trading name used in email/SMS sign-offs ("— BLZ Electric").
  // Distinct from companyName, which carries the legal "Inc.".
  shortName: "BLZ Electric",
  // Public website shown in customer-facing email footers and pay pages.
  website: "leelectrical.us",
  // Sub-line under the company name on the pay pages.
  tagline: "Licensed & insured",
  // Mailbox used for the Gmail authuser= hint on desktop mailto links.
  officeEmail: "office@leelectrical.us",
  /**
   * Banks shown on check / Zelle "Deposit to" pickers. Per-company — not a
   * hard-coded BLZ list. White-label tenants set their own in Settings.
   */
  depositBanks: ["Martin Dorkin", "Wells Fargo", "BLZ Chase"],

  // White-label letter / form surface (letters skill + Con Ed Form A)
  companyNameVariants: ["BLZ Electric Inc.", "BLZ Electric", "LE Electrical"],
  county: "Kings",
  state: "NY",
  ein: "11-2776676",
  dosId: "",
  defaultSignerName: "Levi Kumer",
  defaultSignerTitle: "President",
  /** @type {Array<{id:string,fullName:string,title?:string,isDefaultSigner?:boolean,personalEmail?:string,personalPhone?:string,signatureId?:string}>} */
  owners: [
    {
      id: "owner-levi",
      fullName: "Levi Kumer",
      title: "President",
      isDefaultSigner: true,
      personalEmail: "6140913@gmail.com",
      personalPhone: "219-2140913",
      signatureId: "",
    },
  ],
  /** @type {Array<{id:string,ownerId:string,label?:string,dataUrl?:string,r2Key?:string,active?:boolean,createdAt?:number}>} */
  signatures: [],

  /**
   * AIA G702/G703 requisition billing block. Intentionally its own set of
   * values — LE's requisitions go out under "LE Electrical" with a Suite 297
   * address and a different mailbox from the invoice header.
   */
  requisition: {
    companyName: "LE Electrical",
    addressLines: ["383 Kingston Avenue", "Suite 297", "Brooklyn, New York 11213"],
    phone: "718-594-1850",
    email: "LE@LEelectrical.US",
    signerName: "Martin Dorkin",
  },
};

export const DEFAULT_FEATURES = {
  requisitions: true,
  timeTracking: true,
  changeOrders: true,
  estimates: true,
  statements: true,
  letterhead: true,
  quickbooks: true,
  /**
   * Legacy umbrella for "send & view through QuickBooks". Kept because tenant
   * configs saved before the invoice/estimate split still carry only this key —
   * it seeds both of the per-doc toggles below when they are absent.
   */
  quickbooksDocs: false,
  /** Send/view invoices through QB. Off = local invoice only; sync still runs. */
  quickbooksInvoices: false,
  /** Send/view estimates through QB. Off = local estimate only; sync still runs. */
  quickbooksEstimates: false,
  calendar: true,
  reminders: true,
  progressDashboard: true,
  subCompanies: true,
  paymentCard: true,
  paymentZelle: true,
  paymentCheck: true,
  aiFeatures: true,
  /** Paid AI assistant (chat bubble + future Chats tab). Off for new tenants until licensed. */
  aiAssistant: true,
  speechToText: true,
};

/** Labels for Settings UI — keep in sync with DEFAULT_FEATURES keys. */
export const FEATURE_LABELS = [
  { key: "speechToText", label: "Speech to text" },
  { key: "requisitions", label: "Requisitions (AIA G702/G703)" },
  { key: "timeTracking", label: "Time tracking / clock-in" },
  { key: "changeOrders", label: "Change orders" },
  { key: "estimates", label: "Estimates" },
  { key: "statements", label: "Statements" },
  { key: "letterhead", label: "Letterhead" },
  { key: "quickbooks", label: "QuickBooks synchronization" },
  { key: "quickbooksDocs", label: "Send & view through QuickBooks" },
  { key: "quickbooksInvoices", label: "Send invoices through QuickBooks" },
  { key: "quickbooksEstimates", label: "Send estimates through QuickBooks" },
  { key: "calendar", label: "Calendar" },
  { key: "reminders", label: "Reminders / follow-ups" },
  { key: "progressDashboard", label: "Progress / Build dashboard" },
  { key: "subCompanies", label: "Sub-companies (parent/child)" },
  { key: "paymentCard", label: "Card payments" },
  { key: "paymentZelle", label: "Zelle payments" },
  { key: "paymentCheck", label: "Check payments" },
  { key: "aiFeatures", label: "AI features (image-to-payment, drafts)" },
  { key: "aiAssistant", label: "AI assistant (paid — needs license token)" },
];

/**
 * Feature groups for Settings → Features submenus.
 * Keys must exist in FEATURE_LABELS / DEFAULT_FEATURES.
 */
export const FEATURE_GROUPS = [
  {
    id: "voice",
    title: "Voice & chat",
    hint: "Talk-to-type and chat tools",
    keys: ["speechToText"],
  },
  {
    id: "documents",
    title: "Documents",
    hint: "Estimates, paperwork, letterhead",
    keys: ["estimates", "statements", "letterhead", "changeOrders", "requisitions"],
  },
  {
    id: "operations",
    title: "Operations",
    hint: "Day-to-day job tools",
    keys: ["timeTracking", "calendar", "reminders", "progressDashboard", "subCompanies"],
  },
  {
    id: "payments",
    title: "Payments",
    hint: "How customers can pay",
    keys: ["paymentCard", "paymentZelle", "paymentCheck"],
  },
  {
    id: "ai",
    title: "AI features",
    hint: "Drafts, smart helpers, paid assistant",
    keys: ["aiFeatures", "aiAssistant"],
  },
];

export function featureLabel(key) {
  return FEATURE_LABELS.find((x) => x.key === key)?.label || key;
}

function requisitionFromCompany(p) {
  return {
    companyName: p.companyName || "",
    addressLines: [p.street, p.cityStateZip].filter(Boolean),
    phone: p.phone || "",
    email: p.email || "",
    signerName: DEFAULT_PROFILE.requisition.signerName,
  };
}

export function mergeProfile(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  // Don't let a bare DEFAULT requisition ride in via object spread when the
  // caller only set company name/email — requisition is handled below.
  const { requisition: _drop, ...rRest } = r;
  const p = { ...DEFAULT_PROFILE, ...rRest };
  p.paymentMethods = {
    ...DEFAULT_PROFILE.paymentMethods,
    ...(p.paymentMethods && typeof p.paymentMethods === "object" ? p.paymentMethods : {}),
  };
  const inputHadReq = Object.prototype.hasOwnProperty.call(r, "requisition");
  const rawReq = inputHadReq && r.requisition && typeof r.requisition === "object" ? r.requisition : null;
  const companyAddressLines = [p.street, p.cityStateZip].filter(Boolean);
  const companyCustom =
    (r.companyName && r.companyName !== DEFAULT_PROFILE.companyName) ||
    (r.email && String(r.email).toLowerCase() !== String(DEFAULT_PROFILE.email).toLowerCase());

  if (rawReq) {
    // Explicit requisition (LE seed or tenant override). Missing email/phone
    // fall back to the company profile — never leave a gap filled only by LE
    // defaults when the company is someone else.
    p.requisition = {
      companyName: rawReq.companyName || p.companyName || DEFAULT_PROFILE.requisition.companyName,
      addressLines:
        Array.isArray(rawReq.addressLines) && rawReq.addressLines.length
          ? rawReq.addressLines
          : companyAddressLines.length
            ? companyAddressLines
            : [...DEFAULT_PROFILE.requisition.addressLines],
      phone: rawReq.phone || p.phone || DEFAULT_PROFILE.requisition.phone,
      email: rawReq.email || p.email || DEFAULT_PROFILE.requisition.email,
      signerName: rawReq.signerName || DEFAULT_PROFILE.requisition.signerName,
    };
  } else if (companyCustom) {
    // White-label / demo: Settings → Company is the source for every printout.
    p.requisition = requisitionFromCompany(p);
  } else {
    p.requisition = { ...DEFAULT_PROFILE.requisition };
  }
  // Keep the standard Zelle line pointed at the company email when the
  // mailbox changed but the Zelle wording was left as the default pattern.
  if (p.email) {
    const z = String(p.zelleInstructions || "").trim();
    const m = z.match(/^Zelle:\s*Send payment to\s+(.+?)\.?\s*$/i);
    if (!z) {
      p.zelleInstructions = `Zelle: Send payment to ${p.email}.`;
    } else if (m) {
      const listed = String(m[1] || "").trim();
      if (listed.toLowerCase() !== String(p.email).toLowerCase()) {
        p.zelleInstructions = `Zelle: Send payment to ${p.email}.`;
      }
    }
  }
  p.depositBanks = normalizeDepositBanks(p.depositBanks);
  // Owners + signatures (white-label letters / Con Ed Part E)
  if (!Array.isArray(p.owners) || !p.owners.length) {
    p.owners = Array.isArray(DEFAULT_PROFILE.owners) ? DEFAULT_PROFILE.owners.map((o) => ({ ...o })) : [];
  } else {
    p.owners = p.owners.map((o, i) => ({
      id: o?.id || "owner-" + i,
      fullName: String(o?.fullName || "").trim(),
      title: o?.title || "President",
      isDefaultSigner: !!o?.isDefaultSigner,
      personalEmail: o?.personalEmail || "",
      personalPhone: o?.personalPhone || "",
      signatureId: o?.signatureId || "",
    }));
  }
  if (!p.owners.some((o) => o.isDefaultSigner) && p.owners[0]) p.owners[0].isDefaultSigner = true;
  p.signatures = Array.isArray(p.signatures)
    ? p.signatures.filter((s) => s && (s.dataUrl || s.r2Key)).map((s, i) => ({
        id: s.id || "sig-" + i,
        ownerId: s.ownerId || "",
        label: s.label || "",
        dataUrl: s.dataUrl || "",
        r2Key: s.r2Key || "",
        active: s.active !== false,
        createdAt: s.createdAt || 0,
      }))
    : [];
  if (!Array.isArray(p.companyNameVariants)) p.companyNameVariants = [...(DEFAULT_PROFILE.companyNameVariants || [])];
  if (!p.county) p.county = DEFAULT_PROFILE.county || "";
  if (!p.state) p.state = DEFAULT_PROFILE.state || "NY";
  if (p.ein == null) p.ein = DEFAULT_PROFILE.ein || "";
  if (p.dosId == null) p.dosId = DEFAULT_PROFILE.dosId || "";
  if (!p.defaultSignerName) p.defaultSignerName = DEFAULT_PROFILE.defaultSignerName || "";
  if (!p.defaultSignerTitle) p.defaultSignerTitle = DEFAULT_PROFILE.defaultSignerTitle || "President";
  return p;
}

/** Normalize deposit bank list from array or newline/comma text. */
export function normalizeDepositBanks(raw) {
  if (Array.isArray(raw)) {
    const list = raw.map((s) => String(s || "").trim()).filter(Boolean);
    return list.length ? list : [...DEFAULT_PROFILE.depositBanks];
  }
  if (typeof raw === "string") {
    const list = raw
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    return list.length ? list : [...DEFAULT_PROFILE.depositBanks];
  }
  return [...DEFAULT_PROFILE.depositBanks];
}

/** Deposit-to banks for the active company profile (or defaults). */
export function depositBanksFromProfile(profile) {
  return normalizeDepositBanks(mergeProfile(profile).depositBanks);
}

export function mergeFeatures(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const merged = { ...DEFAULT_FEATURES, ...r };
  // Configs written before invoices/estimates became separate send switches
  // carry only the `quickbooksDocs` umbrella — seed both kinds from it so an
  // existing tenant keeps sending exactly what it sent before.
  if (!Object.prototype.hasOwnProperty.call(r, "quickbooksInvoices")) {
    merged.quickbooksInvoices = merged.quickbooksDocs !== false;
  }
  if (!Object.prototype.hasOwnProperty.call(r, "quickbooksEstimates")) {
    merged.quickbooksEstimates = merged.quickbooksDocs !== false;
  }
  return merged;
}

/** COMPANY-shaped object used by invoice/estimate PDF builders. */
export function companyFromProfile(profile) {
  const p = mergeProfile(profile);
  return {
    name: p.companyName,
    street: p.street,
    cityStateZip: p.cityStateZip,
    phone: p.phone,
    email: p.email,
    license: p.license,
  };
}

export function isFeatureOn(features, key) {
  const f = mergeFeatures(features);
  return f[key] !== false;
}

/** Settings key holding the send-through-QB switch for one document kind. */
export function quickbooksDocFeatureKey(docKind) {
  return docKind === "estimate" ? "quickbooksEstimates" : "quickbooksInvoices";
}

/**
 * Send/view THIS document kind through QuickBooks?
 *
 * Invoices and estimates are separate switches (Levi 2026-07-27) so a tenant can
 * keep sync on and still send only one of them through QB. Configs written
 * before the split carry just `quickbooksDocs`; that umbrella seeds both kinds.
 */
export function quickbooksDocFeature(features, docKind) {
  return mergeFeatures(features)[quickbooksDocFeatureKey(docKind)] !== false;
}

/** True when either document kind may go through QuickBooks. */
export function anyQuickbooksDocFeature(features) {
  return (
    quickbooksDocFeature(features, "invoice") || quickbooksDocFeature(features, "estimate")
  );
}
