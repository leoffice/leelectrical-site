/**
 * Shared agent payment gate for sola-charge / sola-payment / pay-link.
 * Human/owner requests (no agent token) pass through unchanged.
 * Agent requests: require payments===true + per-action confirm; no action
 * enabled until Levi defines permitted ops (scaffold blocks with audit).
 * Processor secrets (SOLA_X_KEY) are never exposed here.
 */
import { getStore } from "./storage/index.mjs";
import { rotateJsonBackup } from "../blob-backup.mjs";
import {
  DOC_KEY,
  emptyDoc,
  extractAgentTokenFromRequest,
  gateAgentPaymentAction,
  hasPaymentConfirmation,
  refreshGrantState,
} from "./agentAccess.mjs";

async function loadAgentDoc() {
  const store = getStore("settings");
  const cur = (await store.get(DOC_KEY, { type: "json", consistency: "strong" })) || emptyDoc();
  return { store, doc: refreshGrantState(cur) };
}

/**
 * @returns {Promise<null | { status: number, body: object }>}
 *   null = continue (human or allowed); body = JSON error to return
 */
export async function enforceAgentPaymentGate(req, body = {}, { op = "payment", amount = null, ref = null } = {}) {
  const token = extractAgentTokenFromRequest(req, body);
  if (!token) return null; // owner / human path

  let store;
  let doc;
  try {
    ({ store, doc } = await loadAgentDoc());
  } catch {
    // If settings store is unreachable, fail closed for agent tokens only.
    return {
      status: 503,
      body: {
        ok: false,
        error: "Could not verify agent payment access. Try again or use an owner session.",
      },
    };
  }

  const gate = gateAgentPaymentAction(
    doc,
    {
      token,
      confirmed: hasPaymentConfirmation(body),
      op,
      amount,
      ref,
    }
  );

  if (gate.doc && store) {
    try {
      await rotateJsonBackup(store, DOC_KEY, gate.doc);
    } catch {
      /* audit write best-effort */
    }
  }

  if (gate.ok) return null;
  return {
    status: gate.status || 403,
    body: {
      ok: false,
      error: gate.error || "Payment access denied",
      needsConfirm: gate.needsConfirm === true,
      scaffoldOnly: gate.scaffoldOnly === true,
    },
  };
}
