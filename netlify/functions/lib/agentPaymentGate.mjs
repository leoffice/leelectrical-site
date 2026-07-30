/**
 * Shared agent payment gate for sola-charge / sola-payment / pay-link.
 * Human/owner requests (no fleet identity) pass through unchanged.
 * Agent requests: require accessOn + paymentsOn + per-action confirm.
 * Processor secrets (SOLA_X_KEY) are never exposed here.
 */
import {
  authenticateFleetIdentity,
  extractFleetIdentityFromRequest,
  gateAgentPaymentAction,
  hasPaymentConfirmation,
} from "./agentAccess.mjs";
import { getAccessStateStore } from "./agentAccessStore.mjs";

/**
 * @returns {Promise<null | { status: number, body: object }>}
 *   null = continue (human or staged-ok); body = JSON error to return
 */
export async function enforceAgentPaymentGate(
  req,
  body = {},
  { op = "payment", amount = null, ref = null, env = {} } = {}
) {
  const claim = extractFleetIdentityFromRequest(req, body);
  // No agent identity headers → owner/human path
  if (!claim.agentId && !claim.key && !claim.sig) return null;

  const auth = authenticateFleetIdentity(claim, env);
  if (!auth.ok) {
    return {
      status: 401,
      body: {
        ok: false,
        error: auth.error || "Agent identity could not be verified.",
        code: "identity_fail",
      },
    };
  }

  let store;
  let doc;
  try {
    store = getAccessStateStore(env);
    doc = await store.get();
  } catch {
    return {
      status: 503,
      body: {
        ok: false,
        error: "Could not verify agent payment access. Try again or use an owner session.",
      },
    };
  }

  const gate = gateAgentPaymentAction(doc, {
    agentId: auth.agentId,
    fleetOk: true,
    confirmed: hasPaymentConfirmation(body),
    op,
    amount,
    ref,
  });

  if (gate.doc && store) {
    try {
      await store.put(gate.doc);
    } catch {
      /* audit write best-effort */
    }
  }

  // staged ok still returns null so the handler can continue into its own
  // confirm path — but scaffold marks staged; charge handlers must re-check
  // owner confirm before calling the processor.
  if (gate.ok) return null;

  return {
    status: gate.status || 403,
    body: {
      ok: false,
      error: gate.error || "Payment access denied",
      code: gate.code,
      needsConfirm: gate.needsConfirm === true,
      scaffoldOnly: gate.scaffoldOnly === true,
    },
  };
}
