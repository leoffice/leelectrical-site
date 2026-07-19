// Default QuickBooks Products & Services — matches BLZ Electric live QBO catalog.
// Host can push a fresher list via POST items { op:"set" }. Use exact names.
//
// WHITE-LABEL: this list is LE Electrical's actual service catalogue, with LE's
// actual prices. It must not be handed to another tenant as their starting
// point — a Chicago plumber should not open the app to "8 Coned Service, $210".
// Use defaultQboItems() rather than importing the array directly; it serves the
// catalogue to the internal tenant only. Every other tenant starts empty and
// fills the list from their own QuickBooks sync (the POST items path above).

import { activeTenantConfig } from "../lib/tenantBranding.js";

export const DEFAULT_QBO_ITEMS = [
  { name: "Service call:Service call", type: "Service", price: 180, description: "Service call" },
  { name: "Service call:Emergency call", type: "Service", price: 225, description: "Emergency service call" },
  { name: "Service call:Emergency after hours call", type: "Service", price: 260, description: "Emergency after hours" },
  { name: "Installation:Ballast Replacement", type: "Service", price: 110, description: "Ballast Replacement" },
  { name: "8 Coned Service:8 Coned Service", type: "Service", price: 210, description: "Coned ticket — main service entrance" },
  { name: "8 Coned Service:Followup visit", type: "Service", price: 210, description: "Follow-up visit" },
  { name: "7 Plans and Permits:Load Letter", type: "Service", price: 500, description: "Load Letter processing fee" },
  { name: "Inspection for insurance:Inspection for insurance", type: "Service", price: 220, description: "General inspection" },
  { name: "Inspection for insurance:Submitting paperwork.", type: "Service", price: 500, description: "Inspection report" },
  { name: "inspection", type: "Service", price: 500, description: "Inspection" },
  { name: "Rental of Equipment", type: "Service", price: 150, description: "Equipment rental" },
  { name: "Tesla Charger:Filing permit:Filing permit", type: "Service", price: 1800, description: "Filing permits with city" },
  { name: "Tesla Charger:Filing permit:superseding a permit.", type: "Service", price: 1800, description: "Supersede permit" },
  { name: "Tesla Charger:Second charger", type: "Service", price: 450, description: "Additional Tesla charger" },
  {
    name: "Replacement of Blink Charger Gen 2:Replacement of Blink Charger Gen 2",
    type: "Non-inventory",
    price: 350,
    description: "Blink Charger Gen 2 installation",
  },
  {
    name: "Replacement of Blink Charger Gen 2:Installation of a 2nd unit in the same address.",
    type: "Non-inventory",
    price: 120,
    description: "2nd unit same address",
  },
  { name: "Service Upgrade:1 Meter", type: "Service", price: 2500, description: "1 new 100A meter + panel + ground" },
  { name: "Service Upgrade:2 Meters", type: "Service", price: 3500, description: "2 new 100A meters + panels" },
  { name: "Service Upgrade:3 Meters", type: "Service", price: 4500, description: "3 new 100A panels + meters" },
  { name: "Service Upgrade:1 Meter 200A", type: "Non-inventory", price: 3200, description: "1 new 200A meter + panel" },
  { name: "Service Upgrade:Over head pipe", type: "Service", price: 1500, description: "Overhead service piping" },
  { name: "General Wiring", type: "Service", price: 0, description: "Custom-priced wiring work" },
  { name: "General electrical work", type: "Service", price: 0, description: "Custom electrical work" },
  { name: "Installation:Installation", type: "Service", price: 0, description: "Installation labor" },
  { name: "Materials", type: "Service", price: 0, description: "Materials" },
  { name: "Tesla Charger:Tesla Charger", type: "Service", price: 0, description: "Tesla charger install" },
  { name: "Violation Resolution", type: "Service", price: 6000, description: "Violation resolution" },
  { name: "Down Payment", type: "Service", price: 0, description: "Customer deposit" },
  { name: "Quickpay Processing Fee", type: "Service", price: 3.5, description: "Credit card fees" },
  { name: "NYC", type: "Service", price: 0, description: "Sales tax (8.88064%)" },
];

/**
 * The starting item catalogue for this tenant. LE (internal) keeps its live
 * QBO list; every other tenant starts empty rather than inheriting LE's
 * services and prices.
 */
export function defaultQboItems() {
  return activeTenantConfig().internal === true ? DEFAULT_QBO_ITEMS : [];
}

export function filterQboItems(items, query) {
  const q = String(query || "")
    .trim()
    .toLowerCase();
  const list = items && items.length ? items : DEFAULT_QBO_ITEMS;
  if (!q) return list.slice(0, 40);
  return list
    .filter((it) => {
      const hay = [it.name, it.description, it.type].filter(Boolean).join(" ").toLowerCase();
      return q.split(/\s+/).every((t) => hay.includes(t));
    })
    .slice(0, 20);
}