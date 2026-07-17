/** Default company profile + feature toggles for LE Pro Settings / white-label. */

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
};

export const DEFAULT_FEATURES = {
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

/** Labels for Settings UI — keep in sync with DEFAULT_FEATURES keys. */
export const FEATURE_LABELS = [
  { key: "speechToText", label: "Speech to text (voice bubble + chat mic)" },
  { key: "requisitions", label: "Requisitions (AIA G702/G703)" },
  { key: "timeTracking", label: "Time tracking / clock-in" },
  { key: "changeOrders", label: "Change orders" },
  { key: "estimates", label: "Estimates" },
  { key: "statements", label: "Statements" },
  { key: "letterhead", label: "Letterhead" },
  { key: "quickbooks", label: "QuickBooks sync" },
  { key: "calendar", label: "Calendar" },
  { key: "reminders", label: "Reminders / follow-ups" },
  { key: "progressDashboard", label: "Progress / Build dashboard" },
  { key: "subCompanies", label: "Sub-companies (parent/child)" },
  { key: "paymentCard", label: "Card payments" },
  { key: "paymentZelle", label: "Zelle payments" },
  { key: "paymentCheck", label: "Check payments" },
  { key: "aiFeatures", label: "AI features (image-to-payment, drafts)" },
];

export function mergeProfile(raw) {
  const p = { ...DEFAULT_PROFILE, ...(raw && typeof raw === "object" ? raw : {}) };
  p.paymentMethods = {
    ...DEFAULT_PROFILE.paymentMethods,
    ...(p.paymentMethods && typeof p.paymentMethods === "object" ? p.paymentMethods : {}),
  };
  return p;
}

export function mergeFeatures(raw) {
  return { ...DEFAULT_FEATURES, ...(raw && typeof raw === "object" ? raw : {}) };
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
