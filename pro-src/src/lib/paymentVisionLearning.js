// Payment photo learning loop — Levi corrects autofill → store delta → feed next read.
// Mirrors invoice-edit learning (ov._invoiceEditLearning) for check/Zelle vision.

const LEARNING_FIELDS = ["amount", "checkNumber", "confirmationNumber", "date", "memo", "invoiceNumber", "payer"];

/** Normalize form / extracted value for comparison. */
export function normalizeLearningValue(field, raw) {
  if (raw == null || raw === "") return "";
  if (field === "amount") {
    const n = parseFloat(String(raw).replace(/[$,*\s]/g, ""));
    return Number.isFinite(n) && n > 0 ? String(Math.round(n * 100) / 100) : "";
  }
  if (field === "checkNumber" || field === "invoiceNumber") {
    return String(raw).replace(/\D/g, "").trim();
  }
  if (field === "confirmationNumber") return String(raw).trim();
  if (field === "date") {
    const s = String(raw).trim();
    const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (m) {
      const yr = m[3].length === 2 ? "20" + m[3] : m[3];
      return `${yr}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
    }
    return s.slice(0, 10);
  }
  return String(raw).trim();
}

/**
 * Build field-level corrections: vision said X, Levi saved Y.
 * Empty vision + filled final = "missed" (still valuable training).
 *
 * Amount special case: the form pre-fills open balance, so if vision
 * returned nothing and amount still equals that default, do NOT train
 * amount (would teach the open balance, not the check).
 * Pass finalFields.openBalanceDefault to enable that skip.
 */
export function computePaymentVisionDelta(extracted, finalFields, kind = "check") {
  const deltas = [];
  const k = kind === "zelle" ? "zelle" : "check";
  const final = finalFields || {};
  const vision = extracted || {};
  const openDefault = normalizeLearningValue("amount", final.openBalanceDefault);

  for (const field of LEARNING_FIELDS) {
    // Zelle uses confirmationNumber; checks use checkNumber (form ref).
    if (k === "check" && field === "confirmationNumber") continue;
    if (k === "zelle" && field === "checkNumber") continue;

    let visionRaw = vision[field];
    if (field === "checkNumber" && !visionRaw) visionRaw = vision.confirmationNumber;
    if (field === "confirmationNumber" && !visionRaw && k === "zelle") visionRaw = vision.checkNumber;
    if (field === "invoiceNumber" && !visionRaw) {
      visionRaw = vision.invoiceNo || vision.invoiceNumber;
    }
    if (field === "payer" && !visionRaw) visionRaw = vision.name || vision.payer;

    let finalRaw = final[field];
    if (field === "checkNumber" || field === "confirmationNumber") {
      finalRaw = final.ref ?? final.checkNumber ?? final.confirmationNumber ?? finalRaw;
    }
    if (field === "amount") finalRaw = final.amount ?? final.amt ?? finalRaw;
    if (field === "invoiceNumber") finalRaw = final.invoiceNo ?? final.invoiceNumber ?? finalRaw;
    if (field === "payer") finalRaw = final.payer ?? final.name ?? finalRaw;
    if (field === "date") finalRaw = final.date ?? final.dt ?? finalRaw;
    if (field === "memo") finalRaw = final.memo ?? finalRaw;

    const v = normalizeLearningValue(field, visionRaw);
    const f = normalizeLearningValue(field, finalRaw);
    if (!f) continue; // Levi left it empty — nothing to train
    if (v === f) continue;
    // Skip amount when it is just the prefilled open balance and vision missed.
    if (field === "amount" && !v && openDefault && f === openDefault) continue;
    deltas.push({
      kind: v ? "field_correction" : "vision_missed",
      field,
      vision: v || null,
      approved: f,
    });
  }
  return deltas;
}

/** True when there is something worth storing (any correction or fill-in). */
export function hasPaymentVisionLearning(deltas) {
  return Array.isArray(deltas) && deltas.length > 0;
}

/**
 * Compact few-shot block for the vision prompt from recent learning entries.
 * Each entry: { kind, deltas: [{field, vision, approved}], visionSnapshot?, source?, proofName?, ts }
 * Gold entries (source includes "gold" + visionSnapshot) emit as full correct-read examples.
 * Only same-kind entries are included (check vs zelle are not mixed).
 */
export function formatLearningForPrompt(entries, kind = "check", max = 8) {
  const want = kind === "zelle" ? "zelle" : "check";
  const all = (Array.isArray(entries) ? entries : []).filter(
    (e) => !e.kind || e.kind === want
  );
  const gold = all
    .filter(
      (e) =>
        e.visionSnapshot &&
        (String(e.source || "").includes("gold") || e.gold === true)
    )
    .slice(-Math.min(4, max));
  const corrections = all
    .filter((e) => Array.isArray(e.deltas) && e.deltas.length)
    .slice(-max);
  if (!gold.length && !corrections.length) return "";

  const lines = [];
  if (gold.length) {
    lines.push(
      want === "zelle"
        ? "GOLD Zelle reads (correct full extracts — match this quality):"
        : "GOLD check reads (correct full extracts — match this quality):"
    );
    for (const e of gold) {
      const s = e.visionSnapshot || {};
      const bits = [];
      if (s.amount != null && s.amount !== "") bits.push(`amount=${s.amount}`);
      if (want === "check" && s.checkNumber) bits.push(`checkNumber=${s.checkNumber}`);
      if (want === "zelle" && (s.confirmationNumber || s.checkNumber)) {
        bits.push(`confirmationNumber=${s.confirmationNumber || s.checkNumber}`);
      }
      if (s.date) bits.push(`date=${s.date}`);
      if (s.memo) bits.push(`memo=${JSON.stringify(s.memo)}`);
      if (s.invoiceNumber) bits.push(`invoiceNumber=${s.invoiceNumber}`);
      if (s.payer) bits.push(`payer=${JSON.stringify(s.payer)}`);
      if (s.depositBank) bits.push(`depositBank=${JSON.stringify(s.depositBank)}`);
      if (e.proofName) bits.push(`(proof: ${e.proofName})`);
      lines.push("- " + bits.join(" · "));
    }
  }
  if (corrections.length) {
    lines.push("Levi's recent corrections (use these patterns — he fixed the reader before):");
    for (const e of corrections) {
      const bits = e.deltas.map((d) => {
        if (d.kind === "vision_missed" || !d.vision) {
          return `${d.field}: you returned null/empty → correct is ${JSON.stringify(d.approved)}`;
        }
        return `${d.field}: you said ${JSON.stringify(d.vision)} → correct is ${JSON.stringify(d.approved)}`;
      });
      lines.push("- " + bits.join("; "));
    }
    lines.push("Apply the same field rules on this new photo.");
  }
  return lines.join("\n");
}

/** Build a store entry from a record attempt. */
export function buildPaymentVisionLearningEntry({
  kind = "check",
  extracted,
  finalFields,
  jobId,
  invoiceNo,
  proofName,
}) {
  const deltas = computePaymentVisionDelta(extracted, finalFields, kind);
  if (!hasPaymentVisionLearning(deltas)) return null;
  return {
    kind: kind === "zelle" ? "zelle" : "check",
    deltas,
    jobId: jobId || "",
    invoiceNo: invoiceNo || "",
    proofName: proofName || "",
    visionSnapshot: extracted
      ? {
          amount: extracted.amount ?? null,
          checkNumber: extracted.checkNumber || extracted.confirmationNumber || null,
          date: extracted.date || null,
          memo: extracted.memo || null,
          invoiceNumber: extracted.invoiceNumber || extracted.invoiceNo || null,
          payer: extracted.payer || extracted.name || null,
        }
      : null,
  };
}
