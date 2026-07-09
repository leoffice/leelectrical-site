// Shared QuickBooks match dropdown — search + add-new on top, full customer rows below.
import React from "react";

export function customerServiceLine(c) {
  return String(c?.serviceAddress || c?.address || "").trim();
}

export function customerBillingLine(c) {
  return String(c?.billingAddress || c?.addr || "").trim();
}

export function CustomerMatchCard({ customer, onPick, testId = "customer-match" }) {
  const business = String(customer?.businessName || customer?.name || "").trim() || "—";
  const person = String(customer?.personName || "").trim();
  const phone = String(customer?.phone || "").trim();
  const email = String(customer?.email || "").trim();
  const billing = customerBillingLine(customer);
  const service = customerServiceLine(customer);

  return (
    <button
      type="button"
      data-testid={testId}
      className="w-full text-left px-3 py-2.5 text-sm hover:bg-slate-50 active:bg-slate-100 border-b border-slate-100 last:border-b-0"
      onClick={() => onPick && onPick(customer)}
    >
      <div className="font-semibold text-slate-800" data-testid="customer-match-business">
        {business}
      </div>
      <div className="mt-1 space-y-0.5 text-[11px] text-slate-600">
        <div data-testid="customer-match-person">
          <span className="text-slate-400">Contact:</span> {person || "—"}
        </div>
        <div data-testid="customer-match-phone">
          <span className="text-slate-400">Phone:</span> {phone || "—"}
        </div>
        <div data-testid="customer-match-email">
          <span className="text-slate-400">Email:</span> {email || "—"}
        </div>
        <div data-testid="customer-match-billing">
          <span className="text-slate-400">Billing:</span> {billing || "—"}
        </div>
        <div data-testid="customer-match-service">
          <span className="text-slate-400">Service:</span> {service || "—"}
        </div>
      </div>
    </button>
  );
}

export function CustomerMatchResults({
  searchValue,
  onSearchChange,
  searchLabel = "Search existing customers",
  onNewCustomer,
  newCustomerLabel = "This is a new customer",
  showNewCustomer = true,
  results = [],
  loading = false,
  onPick,
  testId = "customer-match-results",
  searchTestId = "customer-match-search",
  newCustomerTestId = "customer-add-new",
}) {
  return (
    <div
      className="mt-1 border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm max-h-72 overflow-y-auto lg-scroll-hidden z-10"
      data-testid={testId}
    >
      <div className="sticky top-0 z-10 bg-white border-b border-slate-100 p-2 space-y-2">
        <input
          className="input text-sm"
          value={searchValue || ""}
          onChange={(e) => onSearchChange && onSearchChange(e.target.value)}
          placeholder="Search existing customers…"
          aria-label={searchLabel}
          data-testid={searchTestId}
          autoComplete="off"
        />
        {showNewCustomer ? (
          <button
            type="button"
            data-testid={newCustomerTestId}
            className="w-full text-left px-3 py-2 text-sm font-semibold text-accent rounded-lg border border-accent/20 bg-accent/5 hover:bg-accent/10 active:bg-accent/15"
            onClick={() => onNewCustomer && onNewCustomer()}
          >
            {newCustomerLabel}
          </button>
        ) : null}
      </div>
      {loading ? <div className="px-3 py-2 text-xs text-slate-400">Searching…</div> : null}
      {!loading && results.length === 0 ? (
        <div className="px-3 py-2 text-xs text-slate-400">No matches — try another search or add as new.</div>
      ) : null}
      {results.map((c) => (
        <CustomerMatchCard key={c.id ?? c.name} customer={c} onPick={onPick} />
      ))}
    </div>
  );
}