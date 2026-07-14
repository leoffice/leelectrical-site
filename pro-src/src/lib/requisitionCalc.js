// AIA G702/G703-style requisition math from SOV line items + completion %.

export function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Change-order SOV lines (CO - 01, etc.) — billed separately from base contract. */
export function isChangeOrderItem(it) {
  return /^co\s*-/i.test(String(it?.description || "").trim());
}

export function baseContractItems(items) {
  return (items || []).filter((it) => !isChangeOrderItem(it));
}

export function changeOrderItems(items) {
  return (items || []).filter((it) => isChangeOrderItem(it));
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

/** Roll up SOV items into G703 continuation rows. */
export function buildG703Rows(items, prevItemsById = {}) {
  return (items || []).map((it, idx) => {
    const prev = prevItemsById[it.id];
    const prevPct = prev ? prev.completedPct : 0;
    const scheduled = roundMoney(it.value);
    const prevEarned = itemPreviouslyEarned(it, prevPct);
    const thisPeriod = itemThisPeriod(it, prevPct);
    const totalCompleted = itemEarned(it);
    const balance = roundMoney(scheduled - totalCompleted);
    const pctComplete = scheduled ? roundMoney((totalCompleted / scheduled) * 100) : 0;
    return {
      itemNo: idx + 1,
      description: it.section ? `${it.section} — ${it.description}` : it.description,
      scheduledValue: scheduled,
      prevCompleted: prevEarned,
      thisPeriod,
      storedMaterial: 0,
      totalCompleted,
      pctComplete,
      balance,
      retainage: 0,
    };
  });
}

/**
 * Build G702 application summary.
 * @param {object} project — { contractSum, retainagePct, changeOrders, items, requisitions }
 * @param {object} opts — { periodTo, prevItemsById }
 */
export function buildG702(project, opts = {}) {
  const contractSum = roundMoney(project.contractSum || 0);
  const changeOrders = roundMoney(project.changeOrders || 0);
  const contractToDate = roundMoney(contractSum + changeOrders);
  const retainagePct = Number(project.retainagePct) || 10;

  const g703 = buildG703Rows(project.items || [], opts.prevItemsById || {});
  const totalCompletedRaw = roundMoney(g703.reduce((s, r) => s + r.totalCompleted, 0));
  const totalCompleted = roundMoney(Math.min(totalCompletedRaw, contractToDate));
  const retainage = roundMoney((totalCompleted * retainagePct) / 100);
  const earnedLessRetainage = roundMoney(totalCompleted - retainage);

  const prevCertsRaw = roundMoney(
    (project.requisitions || [])
      .filter((r) => r.status !== "void" && r.status !== "draft")
      .reduce((s, r) => s + (Number(r.amountCertified) || Number(r.currentPaymentDue) || 0), 0)
  );
  const currentDue = roundMoney(Math.max(0, earnedLessRetainage - prevCertsRaw));
  const prevCerts = roundMoney(earnedLessRetainage - currentDue);
  const balanceToFinish = roundMoney(Math.max(0, contractToDate - totalCompleted));

  const reqNum = (project.requisitions?.length || 0) + 1;

  return {
    applicationNumber: `REQ-${reqNum}`,
    periodTo: opts.periodTo || new Date().toISOString().slice(0, 10),
    originalContractSum: contractSum,
    netChangeOrders: changeOrders,
    contractSumToDate: contractToDate,
    totalCompleted,
    retainagePct,
    retainageCompletedWork: retainage,
    retainageStoredMaterial: 0,
    totalRetainage: retainage,
    earnedLessRetainage,
    previousCertificates: prevCerts,
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