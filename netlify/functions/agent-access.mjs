/**
 * Agent Access API — toggle + fleet identity (AGENT_ACCESS_STANDARD).
 * GET  → status
 * POST → { op: status | set_access | set_timer | set_payments | stop | authorize |
 *          mint_session | enter_session | record_action }
 *
 * Codes (mint/redeem/extend) are removed. Access-state lives in Durable Object
 * when AGENT_ACCESS binding is present (required in prod).
 * mint_session / enter_session: lock-screen "Enter as agent" — requires genuine
 * fleet identity + access ON; returns signed UI session for markAgentUnlocked.
 */
import {
  APP_ID,
  authenticateFleetIdentity,
  authorizeAgentAction,
  emptyDoc,
  extractFleetIdentityFromRequest,
  mintAgentSession,
  publicAccessState,
  recordAction,
  setAccess,
  setPayments,
  setTimerMode,
  statusPayload,
  stopAccess,
} from "./lib/agentAccess.mjs";
import { getAccessStateStore } from "./lib/agentAccessStore.mjs";

function json(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers":
        "content-type,authorization,x-le-agent-id,x-le-agent-key,x-le-agent-ts,x-le-agent-sig,x-agent-token",
    },
  });
}

export default async (req, env = {}) => {
  if (req.method === "OPTIONS") return json({ ok: true });

  const store = getAccessStateStore(env, APP_ID);
  let doc;
  try {
    doc = await store.get();
  } catch (e) {
    return json(
      {
        ok: false,
        error: String(e?.message || e || "access-state store unavailable"),
        storeMode: store.mode,
      },
      503
    );
  }

  if (req.method === "GET") {
    const payload = statusPayload(doc);
    if (payload._doc !== doc) {
      try {
        await store.put(payload._doc);
      } catch {
        /* best-effort persist auto-off */
      }
    }
    const { _doc, ...rest } = payload;
    return json({ ...rest, storeMode: store.mode });
  }

  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

  let body = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const op = String(body.op || "status").toLowerCase();

  if (op === "status") {
    const payload = statusPayload(doc);
    if (payload._doc !== doc) {
      try {
        await store.put(payload._doc);
      } catch {
        /* ignore */
      }
    }
    const { _doc, ...rest } = payload;
    return json({ ...rest, storeMode: store.mode });
  }

  // Owner toggles — same exposure model as prior mint (Settings, internal tenant)
  if (op === "set_access" || op === "toggle" || op === "on" || op === "off") {
    const on =
      op === "on" ? true : op === "off" ? false : body.on === true || body.accessOn === true;
    const result = setAccess(doc, {
      on,
      timerMode: body.timerMode,
      actor: body.actor || "owner",
    });
    await store.put(result.doc);
    return json({
      ok: true,
      state: result.state,
      audit: (result.doc.audit || []).slice(0, 40),
      storeMode: store.mode,
      message: result.state.accessOn
        ? result.state.standing
          ? "Agent access ON · standing until you stop it"
          : "Agent access ON · 24h auto-off"
        : "Agent access OFF",
    });
  }

  if (op === "set_timer" || op === "timer") {
    const result = setTimerMode(doc, {
      timerMode: body.timerMode,
      actor: body.actor || "owner",
    });
    await store.put(result.doc);
    return json({
      ok: true,
      state: result.state,
      audit: (result.doc.audit || []).slice(0, 40),
      storeMode: store.mode,
    });
  }

  if (op === "set_payments" || op === "payments") {
    const result = setPayments(doc, {
      on: body.on === true || body.paymentsOn === true,
      actor: body.actor || "owner",
    });
    await store.put(result.doc);
    return json({
      ok: true,
      state: result.state,
      audit: (result.doc.audit || []).slice(0, 40),
      storeMode: store.mode,
      message: result.state.paymentsOn
        ? "Payment management ON · stages only · every charge needs your confirm"
        : "Payment management OFF",
    });
  }

  if (op === "stop" || op === "revoke") {
    const result = stopAccess(doc, { actor: body.actor || "owner-stop" });
    await store.put(result.doc);
    return json({
      ok: true,
      revoked: true,
      state: result.state,
      grant: null,
      audit: (result.doc.audit || []).slice(0, 40),
      storeMode: store.mode,
      message: "Agent access stopped",
    });
  }

  // Fleet authorize — assume-and-act check
  if (op === "authorize" || op === "check") {
    const claim = extractFleetIdentityFromRequest(req, body);
    const id = authenticateFleetIdentity(claim, env);
    if (!id.ok) {
      return json({ ok: false, error: id.error, code: "identity_fail" }, 401);
    }
    const auth = authorizeAgentAction(doc, {
      agentId: id.agentId,
      requirePayments: body.requirePayments === true,
    });
    if (auth.doc && auth.doc !== doc) {
      try {
        await store.put(auth.doc);
      } catch {
        /* ignore */
      }
    }
    if (!auth.ok) {
      return json(
        {
          ok: false,
          error: auth.error,
          code: auth.code || "access_off",
          state: auth.state || publicAccessState(doc),
        },
        auth.status || 403
      );
    }
    return json({
      ok: true,
      agentId: id.agentId,
      state: auth.state,
      paymentsOn: auth.paymentsOn,
      storeMode: store.mode,
    });
  }

  // Lock-screen "Enter as agent" — mint signed UI session (fleet identity required)
  if (op === "mint_session" || op === "enter_session" || op === "ui_enter") {
    const claim = extractFleetIdentityFromRequest(req, body);
    const id = authenticateFleetIdentity(claim, env);
    if (!id.ok) {
      return json(
        {
          ok: false,
          error: id.error,
          code: "identity_fail",
          message: "Genuine fleet identity required to enter as agent.",
        },
        401
      );
    }
    const minted = mintAgentSession(
      doc,
      { agentId: id.agentId, label: body.label || id.agentId },
      env
    );
    if (minted.doc) {
      try {
        await store.put(minted.doc);
      } catch {
        /* best-effort audit persist */
      }
    }
    if (!minted.ok) {
      return json(
        {
          ok: false,
          error: minted.error || "agent access is off",
          code: minted.code || "access_off",
          state: minted.state || publicAccessState(doc),
          storeMode: store.mode,
        },
        minted.status || 403
      );
    }
    return json({
      ok: true,
      token: minted.token,
      grantId: minted.grantId,
      scope: minted.scope,
      expiresAt: minted.expiresAt,
      startedAt: minted.startedAt,
      paymentsOn: minted.paymentsOn,
      label: minted.label,
      agentId: minted.agentId,
      state: minted.state,
      storeMode: store.mode,
      message: "Agent UI session minted — use markAgentUnlocked on the lock screen.",
    });
  }

  if (op === "record_action" || op === "audit") {
    const claim = extractFleetIdentityFromRequest(req, body);
    // Owner can also record; if agent headers present, verify them
    let agentId = body.agentId || body.actor || "owner";
    if (claim.agentId || claim.key || claim.sig) {
      const id = authenticateFleetIdentity(claim, env);
      if (!id.ok) return json({ ok: false, error: id.error }, 401);
      agentId = id.agentId;
    }
    const result = recordAction(doc, {
      type: body.type || "action",
      note: body.note,
      agentId,
      op: body.actionOp || body.action,
      amount: body.amount,
      ref: body.ref,
      result: body.result,
    });
    await store.put(result.doc);
    return json({
      ok: true,
      audit: (result.doc.audit || []).slice(0, 40),
      state: publicAccessState(result.doc),
    });
  }

  // Reject obsolete code ops explicitly
  if (["mint", "redeem", "extend", "refresh", "end"].includes(op)) {
    return json(
      {
        ok: false,
        error:
          "Access codes are removed. Use Settings toggles (access / timer / payments) and fleet identity. See AGENT_ACCESS_STANDARD.",
        code: "codes_removed",
      },
      410
    );
  }

  return json({ ok: false, error: `unknown op: ${op}` }, 400);
};
