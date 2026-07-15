// AIA G702/G703-style requisition math from SOV line items + completion %.

export function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Change-order SOV lines (CO - 01, etc.) — tracked separately, not on progress requisitions. */
export function isChangeOrderItem(it) {
  return /^co\s*-/i.test(String(it?.description || "").trim());
}

export function baseContractItems(items) {
  return (items || []).filter((it) => !isChangeOrderItem(it));
}

export function changeOrderItems(items) {
  return (items || []).filter((it) => isChangeOrderItem(it));
}

/** SOV lines that belong on a progress requisition (excludes change-order lines). */
export function requisitionItems(items) {
  return baseContractItems(items);
}

export function sumItemValues(items) {
  return roundMoney((items || []).reduce((s, it) => s + (Number(it.value) || 0), 0));
}

export function itemEarned(item) {
  const pct = Math.min(100, Math.max(0, Number(item.completedPct) || 0));
  return roundMoney((item.value * pct) / 100);
}

export function itemPreviouslyEarned(item, prevCompletedPct) {
  const pct = Math.min(100, Math.max(0, Number(prevCompletedPct) || 0));
  return roundMoney((item.value * pct) / 100);
}

export function itemThisPeriod(item, prevCompletedPct = 0) {
  return roundMoney(itemEarned(item) - itemPreviouslyEarned(item, prevCompletedPct));
}

/** Retainage % that applies to one SOV line — a per-line override, else the project rate. */
export function lineRetainagePct(item, projectPct = 10) {
  const base = Number(projectPct) || 0;
  if (item && item.retainagePct != null && item.retainagePct !== "") return Number(item.retainagePct) || 0;
  if (item && item.retainageExempt) return 0; // e.g. service-equipment lines billed without retainage
  return base;
}

/** Roll up SOV items into G703 continuation rows (retainage is per-line — see lineRetainagePct). */
export function buildG703Rows(items, prevItemsById = {}, retainagePct = 10) {
  return (items || []).map((it, idx) => {
    const prev = prevItemsById[it.id];
    const prevPct = prev ? prev.completedPct : 0;
    const scheduled = roundMoney(it.value);
    const prevEarned = itemPreviouslyEarned(it, prevPct);
    const thisPeriod = itemThisPeriod(it, prevPct);
    const totalCompleted = itemEarned(it);
    const balance = roundMoney(scheduled - totalCompleted);
    const pctComplete = scheduled ? roundMoney((totalCompleted / scheduled) * 100) : 0;
    const retPct = lineRetainagePct(it, retainagePct);
    return {
      itemNo: idx + 1,
      description: it.section ? `${it.section} - ${it.description}` : it.description,
      scheduledValue: scheduled,
      prevCompleted: prevEarned,
      thisPeriod,
      storedMaterial: 0,
      totalCompleted,
      pctComplete,
      balance,
      retainagePct: retPct,
      retainage: roundMoney((totalCompleted * retPct) / 100),
    };
  });
}

/**
 * Build G702 application summary.
 *
 * Change orders are handled as an AGGREGATE (net total + completed-to-date),
 * not as per-line SOV items, because the real Baez COs aren't itemised in the
 * app yet. `opts.changeOrders` = net change-order total (AIA line 2);
 * `opts.changeOrdersCompleted` = $ of that total earned to date (rolls into
 * line 4). `opts.changeOrdersPrevCompleted` = the prior period's figure (for
 * the G703 "from previous" split).
 *
 * "Previous certificates" (line 7) is the prior period's *total earned less
 * retainage* (the running cumulative = sum of prior draws), NOT a % of the
 * contract — falls back to summing prior draw amounts when earlier records
 * predate this field.
 *
 * @param {object} project — { contractSum, retainagePct, items, requisitions }
 * @param {object} opts — { periodTo, prevItemsById, changeOrders, changeOrdersCompleted, changeOrdersPrevCompleted }
 */
export function buildG702(project, opts = {}) {
  const contractSum = roundMoney(project.contractSum || 0);
  const retainagePct = Number(project.retainagePct) || 10;

  const coTotal = roundMoney(
    opts.changeOrders != null ? opts.changeOrders : opts.includeChangeOrders ? project.changeOrders || 0 : 0
  );
  const coCompleted = roundMoney(Math.min(opts.changeOrdersCompleted != null ? opts.changeOrdersCompleted : 0, coTotal));
  const coPrevCompleted = roundMoney(Math.min(opts.changeOrdersPrevCompleted != null ? opts.changeOrdersPrevCompleted : 0, coCompleted));
  const contractToDate = roundMoney(contractSum + coTotal);

  const baseItems = requisitionItems(project.items);
  const g703base = buildG703Rows(baseItems, opts.prevItemsById || {}, retainagePct);
  const baseCompleted = roundMoney(g703base.reduce((s, r) => s + r.totalCompleted, 0));
  const totalCompletedRaw = roundMoney(baseCompleted + coCompleted);
  const totalCompleted = roundMoney(Math.min(totalCompletedRaw, contractToDate));
  // Retainage is summed PER LINE (some SOV lines, e.g. service equipment, are
  // billed at 0% retainage), not a flat % of the total.
  const coRetPct = opts.changeOrdersRetainagePct != null ? Number(opts.changeOrdersRetainagePct) : retainagePct;
  const baseRetainage = roundMoney(g703base.reduce((s, r) => s + r.retainage, 0));
  const coRetainage = roundMoney((coCompleted * coRetPct) / 100);
  const retainage = roundMoney(baseRetainage + coRetainage);
  const earnedLessRetainage = roundMoney(totalCompleted - retainage);

  // Line 7 = prior period's cumulative earned-less-retainage (= sum of prior
  // draws). Prefer the stored cumulative; fall back to summing draws for legacy
  // records that never stored earnedLessRetainage.
  const priorReqs = (project.requisitions || []).filter((r) => r.status !== "void" && r.status !== "draft");
  const maxPriorElr = priorReqs.reduce((m, r) => Math.max(m, Number(r.earnedLessRetainage) || 0), 0);
  const sumPriorDraws = priorReqs.reduce((s, r) => s + (Number(r.amountCertified) || Number(r.currentPaymentDue) || 0), 0);
  // "Previously paid" (line 7) is normally the prior period's cumulative earned-
  // less-retainage, but Levi can override it to the amount he ACTUALLY received
  // (the GC sometimes certifies less than requested — see reconciliation notes).
  const hasPrevOverride =
    opts.previousCertificates != null && opts.previousCertificates !== "" && !Number.isNaN(Number(opts.previousCertificates));
  const computedPrevCerts = maxPriorElr > 0 ? maxPriorElr : sumPriorDraws;
  const prevCertsRaw = roundMoney(hasPrevOverride ? Number(opts.previousCertificates) : computedPrevCerts);
  const currentDue = roundMoney(Math.max(0, earnedLessRetainage - prevCertsRaw));
  const prevCerts = roundMoney(earnedLessRetainage - currentDue);
  // AIA G702 line 9 = line 3 (contract sum to date) - line 6 (total earned less
  // retainage). At 100% complete this equals the retainage still held, not zero.
  const balanceToFinish = roundMoney(contractToDate - earnedLessRetainage);

  const g703 = [...g703base];
  if (coTotal > 0) {
    g703.push({
      itemNo: g703.length + 1,
      description: "Change Orders (net) - completed to date",
      scheduledValue: coTotal,
      prevCompleted: coPrevCompleted,
      thisPeriod: roundMoney(coCompleted - coPrevCompleted),
      storedMaterial: 0,
      totalCompleted: coCompleted,
      pctComplete: coTotal ? roundMoney((coCompleted / coTotal) * 100) : 0,
      balance: roundMoney(coTotal - coCompleted),
      retainagePct: coRetPct,
      retainage: roundMoney((coCompleted * coRetPct) / 100),
    });
  }

  const reqNum = priorReqs.length + 1;

  return {
    applicationNumber: `REQ-${reqNum}`,
    periodTo: opts.periodTo || new Date().toISOString().slice(0, 10),
    originalContractSum: contractSum,
    netChangeOrders: coTotal,
    contractSumToDate: contractToDate,
    totalCompleted,
    retainagePct,
    retainageCompletedWork: retainage,
    retainageStoredMaterial: 0,
    totalRetainage: retainage,
    earnedLessRetainage,
    previousCertificates: prevCerts,
    computedPreviousCertificates: roundMoney(computedPrevCerts),
    previousCertificatesOverridden: hasPrevOverride,
    currentPaymentDue: currentDue,
    balanceToFinish,
    g703,
  };
}

export function overallPct(items) {
  const total = (items || []).reduce((s, it) => s + (it.value || 0), 0);
  if (!total) return 0;
  const earned = (items || []).reduce((s, it) => s + itemEarned(it), 0);
  return roundMoney((earned / total) * 100);
}