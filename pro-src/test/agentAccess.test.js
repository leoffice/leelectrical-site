// Agent Access — toggle + fleet identity (AGENT_ACCESS_STANDARD).
import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import {
  AUTO_OFF_MS,
  authenticateFleetIdentity,
  authorizeAgentAction,
  emptyDoc,
  ensureStandingCode,
  gateAgentPaymentAction,
  hasPaymentConfirmation,
  mintAgentSession,
  mintAgentSessionByCode,
  publicAccessState,
  refreshAccessState,
  setAccess,
  setPayments,
  setTimerMode,
  statusPayload,
  stopAccess,
  verifyAgentSessionToken,
  verifyStandingCode,
} from "../../netlify/functions/lib/agentAccess.mjs";
import { formatAccessStatusLine, formatRemaining } from "../src/lib/agentAccessClient.js";

describe("agent access toggle model", () => {
  it("starts OFF with payments OFF", () => {
    const st = publicAccessState(emptyDoc());
    expect(st.accessOn).toBe(false);
    expect(st.paymentsOn).toBe(false);
    expect(st.standing).toBe(false);
  });

  it("turns access ON in manual (standing) mode", () => {
    const now = 1_700_000_000_000;
    const { doc, state } = setAccess(emptyDoc(), { on: true, timerMode: "manual" }, now);
    expect(state.accessOn).toBe(true);
    expect(state.standing).toBe(true);
    expect(state.autoOffAt).toBe(null);
    expect(doc.audit[0].type).toBe("access_on");
  });

  it("turns access ON with 24h auto-off", () => {
    const now = 1_700_000_000_000;
    const { state } = setAccess(emptyDoc(), { on: true, timerMode: "24h" }, now);
    expect(state.accessOn).toBe(true);
    expect(state.timerMode).toBe("24h");
    expect(state.autoOffAt).toBe(now + AUTO_OFF_MS);
    expect(state.remainingMs).toBe(AUTO_OFF_MS);
    expect(state.standing).toBe(false);
  });

  it("auto-offs after 24h window", () => {
    const now = 2_000_000_000_000;
    const { doc } = setAccess(emptyDoc(), { on: true, timerMode: "24h" }, now);
    const expired = refreshAccessState(doc, now + AUTO_OFF_MS + 1);
    expect(expired.accessOn).toBe(false);
    expect(expired.paymentsOn).toBe(false);
    expect(expired.audit[0].type).toBe("auto_off");
  });

  it("manual mode never auto-expires", () => {
    const now = 3_000_000_000_000;
    const { doc } = setAccess(emptyDoc(), { on: true, timerMode: "manual" }, now);
    const later = refreshAccessState(doc, now + 30 * AUTO_OFF_MS);
    expect(later.accessOn).toBe(true);
  });

  it("STOP clears access and payments instantly", () => {
    const now = 4_000_000_000_000;
    let doc = setAccess(emptyDoc(), { on: true, timerMode: "manual" }, now).doc;
    doc = setPayments(doc, { on: true }, now + 1).doc;
    expect(doc.paymentsOn).toBe(true);
    const stopped = stopAccess(doc, { actor: "owner-stop" }, now + 2);
    expect(stopped.state.accessOn).toBe(false);
    expect(stopped.state.paymentsOn).toBe(false);
    expect(stopped.doc.audit[0].type).toBe("access_off");
  });

  it("payments defaults OFF and requires explicit opt-in", () => {
    const now = 5_000_000_000_000;
    let doc = setAccess(emptyDoc(), { on: true }, now).doc;
    expect(doc.paymentsOn).toBe(false);
    doc = setPayments(doc, { on: true }, now + 1).doc;
    expect(doc.paymentsOn).toBe(true);
    expect(doc.audit[0].type).toBe("payments_on");
  });

  it("setTimerMode switches between 24h and manual while on", () => {
    const now = 6_000_000_000_000;
    let doc = setAccess(emptyDoc(), { on: true, timerMode: "manual" }, now).doc;
    const to24 = setTimerMode(doc, { timerMode: "24h" }, now + 1000);
    expect(to24.state.timerMode).toBe("24h");
    expect(to24.state.autoOffAt).toBe(now + 1000 + AUTO_OFF_MS);
    const toMan = setTimerMode(to24.doc, { timerMode: "manual" }, now + 2000);
    expect(toMan.state.standing).toBe(true);
    expect(toMan.state.autoOffAt).toBe(null);
  });

  it("statusPayload exposes standing-code model (no plain code on status)", () => {
    const p = statusPayload(emptyDoc());
    expect(p.ok).toBe(true);
    expect(p.defaults.standingCode).toBe(true);
    expect(p.defaults.model).toMatch(/standing-code|toggle/);
    expect(p.grant).toBe(null);
    expect(p.state.hasStandingCode).toBe(false);
  });

  it("setAccess ON creates a standing unlock code", () => {
    const now = 1_710_000_000_000;
    const { doc, state, standingCode } = setAccess(emptyDoc(), { on: true, timerMode: "manual" }, now);
    expect(state.accessOn).toBe(true);
    expect(standingCode).toMatch(/^LE-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(doc.standingCodeHash).toBeTruthy();
    expect(doc.standingCode).toBe(standingCode);
  });
});

describe("standing unlock code", () => {
  const secret = "test-fleet-secret-do-not-use-prod";
  const env = { LE_FLEET_AGENT_SECRET: secret };

  it("verifyStandingCode fails when access off", () => {
    const { doc, code } = ensureStandingCode(emptyDoc(), { forceRotate: true });
    const r = verifyStandingCode(doc, code);
    expect(r.ok).toBe(false);
    expect(r.code).toBe("access_off");
  });

  it("mints UI session with standing code while access ON", () => {
    const now = 1_720_000_000_000;
    let doc = setAccess(emptyDoc(), { on: true, timerMode: "manual" }, now).doc;
    const code = doc.standingCode;
    expect(code).toBeTruthy();
    const r = mintAgentSessionByCode(doc, { unlockCode: code }, env, now + 1);
    expect(r.ok).toBe(true);
    expect(r.token).toBeTruthy();
    expect(r.agentId).toBe("standing-code");
    const v = verifyAgentSessionToken(r.token, env, now + 2);
    expect(v.ok).toBe(true);
  });

  it("rejects wrong standing code", () => {
    const now = 1_730_000_000_000;
    const doc = setAccess(emptyDoc(), { on: true }, now).doc;
    const r = mintAgentSessionByCode(doc, { unlockCode: "LE-WRONG-CODE" }, env, now + 1);
    expect(r.ok).toBe(false);
    expect(r.code).toBe("bad_code");
  });

  it("stops working when access is turned OFF", () => {
    const now = 1_740_000_000_000;
    let doc = setAccess(emptyDoc(), { on: true }, now).doc;
    const code = doc.standingCode;
    doc = stopAccess(doc, {}, now + 1).doc;
    const r = mintAgentSessionByCode(doc, { unlockCode: code }, env, now + 2);
    expect(r.ok).toBe(false);
    expect(r.code).toBe("access_off");
  });

  it("rotate invalidates prior code", () => {
    const now = 1_750_000_000_000;
    let doc = setAccess(emptyDoc(), { on: true }, now).doc;
    const oldCode = doc.standingCode;
    const rotated = ensureStandingCode(doc, { forceRotate: true }, now + 1);
    doc = rotated.doc;
    expect(rotated.code).not.toBe(oldCode);
    expect(mintAgentSessionByCode(doc, { unlockCode: oldCode }, env, now + 2).ok).toBe(false);
    expect(mintAgentSessionByCode(doc, { unlockCode: rotated.code }, env, now + 3).ok).toBe(true);
  });
});

describe("fleet identity", () => {
  const secret = "test-fleet-secret-do-not-use-prod";
  const env = { LE_FLEET_AGENT_SECRET: secret };

  it("accepts known agent with shared secret", () => {
    const r = authenticateFleetIdentity({ agentId: "israel", key: secret }, env);
    expect(r.ok).toBe(true);
    expect(r.agentId).toBe("israel");
  });

  it("rejects unknown agent id", () => {
    const r = authenticateFleetIdentity({ agentId: "hacker", key: secret }, env);
    expect(r.ok).toBe(false);
  });

  it("rejects wrong secret", () => {
    const r = authenticateFleetIdentity({ agentId: "israel", key: "nope" }, env);
    expect(r.ok).toBe(false);
  });

  it("accepts HMAC signature with fresh ts", () => {
    const now = Date.now();
    const sig = createHmac("sha256", secret).update(`eved:${now}`).digest("hex");
    const r = authenticateFleetIdentity({ agentId: "eved", ts: String(now), sig }, env, now);
    expect(r.ok).toBe(true);
    expect(r.method).toBe("hmac");
  });

  it("rejects stale HMAC", () => {
    const now = Date.now();
    const old = now - 10 * 60 * 1000;
    const sig = createHmac("sha256", secret).update(`israel:${old}`).digest("hex");
    const r = authenticateFleetIdentity({ agentId: "israel", ts: String(old), sig }, env, now);
    expect(r.ok).toBe(false);
  });
});

describe("authorize + payment gate", () => {
  it("denies when access is off with plain message", () => {
    const r = authorizeAgentAction(emptyDoc(), { agentId: "israel" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/access is off/i);
  });

  it("allows when access is on", () => {
    const now = 7_000_000_000_000;
    const { doc } = setAccess(emptyDoc(), { on: true, timerMode: "manual" }, now);
    const r = authorizeAgentAction(doc, { agentId: "israel" }, now);
    expect(r.ok).toBe(true);
  });

  it("payment gate: human passes; agent without payments denied; confirm required", () => {
    const now = 8_000_000_000_000;
    let doc = setAccess(emptyDoc(), { on: true }, now).doc;

    const human = gateAgentPaymentAction(doc, { fleetOk: false }, now);
    expect(human.kind).toBe("human");
    expect(human.ok).toBe(true);

    const noPay = gateAgentPaymentAction(
      doc,
      { agentId: "israel", fleetOk: true, confirmed: true, op: "sola-charge" },
      now
    );
    expect(noPay.ok).toBe(false);
    expect(noPay.error).toMatch(/payment/i);

    doc = setPayments(doc, { on: true }, now + 1).doc;
    const noConfirm = gateAgentPaymentAction(
      doc,
      { agentId: "israel", fleetOk: true, confirmed: false, op: "sola-charge" },
      now + 2
    );
    expect(noConfirm.ok).toBe(false);
    expect(noConfirm.needsConfirm).toBe(true);

    const staged = gateAgentPaymentAction(
      doc,
      { agentId: "israel", fleetOk: true, confirmed: true, op: "sola-charge", amount: 100 },
      now + 3
    );
    expect(staged.ok).toBe(true);
    expect(staged.staged).toBe(true);
  });

  it("hasPaymentConfirmation reads common flags", () => {
    expect(hasPaymentConfirmation({})).toBe(false);
    expect(hasPaymentConfirmation({ paymentConfirmed: true })).toBe(true);
    expect(hasPaymentConfirmation({ confirmToken: "abcdefgh" })).toBe(true);
  });

  it("password / processor secrets never appear in public state or audit notes from helpers", () => {
    const now = 9_000_000_000_000;
    const { doc, state } = setAccess(emptyDoc(), { on: true }, now);
    const blob = JSON.stringify({ state, audit: doc.audit });
    expect(blob.toLowerCase()).not.toMatch(/password|sola_x_key|resolvexkey/);
  });
});

describe("mintAgentSession (lock-screen Enter as agent)", () => {
  const secret = "test-fleet-secret-do-not-use-prod";
  const env = { LE_FLEET_AGENT_SECRET: secret };

  it("denies when access is off", () => {
    const r = mintAgentSession(emptyDoc(), { agentId: "israel" }, env, Date.now());
    expect(r.ok).toBe(false);
    expect(r.code).toBe("access_off");
    expect(r.error).toMatch(/access is off/i);
  });

  it("mints signed token when access on (manual standing)", () => {
    const now = 10_000_000_000_000;
    const { doc } = setAccess(emptyDoc(), { on: true, timerMode: "manual" }, now);
    const r = mintAgentSession(doc, { agentId: "dispatch" }, env, now);
    expect(r.ok).toBe(true);
    expect(r.token).toMatch(/\./);
    expect(r.grantId).toMatch(/^ags_/);
    expect(r.scope).toBe("full-nopay");
    expect(r.paymentsOn).toBe(false);
    expect(r.expiresAt).toBeGreaterThan(now);
    expect(r.doc.audit[0].type).toBe("ui_enter");
    const v = verifyAgentSessionToken(r.token, env, now);
    expect(v.ok).toBe(true);
    expect(v.session.agentId).toBe("dispatch");
    expect(v.session.grantId).toBe(r.grantId);
  });

  it("scope full when payments on; expires at autoOffAt in 24h mode", () => {
    const now = 11_000_000_000_000;
    let doc = setAccess(emptyDoc(), { on: true, timerMode: "24h" }, now).doc;
    doc = setPayments(doc, { on: true }, now + 1).doc;
    const r = mintAgentSession(doc, { agentId: "israel" }, env, now + 2);
    expect(r.ok).toBe(true);
    expect(r.paymentsOn).toBe(true);
    expect(r.scope).toBe("full");
    expect(r.expiresAt).toBe(now + AUTO_OFF_MS);
  });

  it("rejects forged or expired tokens", () => {
    const now = 12_000_000_000_000;
    const { doc } = setAccess(emptyDoc(), { on: true }, now);
    const r = mintAgentSession(doc, { agentId: "eved" }, env, now);
    expect(r.ok).toBe(true);
    const [body] = r.token.split(".");
    const forged = `${body}.${"00".repeat(32)}`;
    expect(verifyAgentSessionToken(forged, env, now).ok).toBe(false);
    expect(verifyAgentSessionToken(r.token, env, r.expiresAt + 1).ok).toBe(false);
  });

  it("rejects tokens bound to a different app (cross-tenant)", () => {
    const now = 12_500_000_000_000;
    const { doc } = setAccess(emptyDoc(), { on: true }, now);
    const r = mintAgentSession(doc, { agentId: "israel" }, env, now);
    expect(r.ok).toBe(true);
    const [body] = r.token.split(".");
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    payload.appId = "other-app";
    const foreignBody = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    const foreignSig = createHmac("sha256", secret).update(foreignBody).digest("hex");
    const foreignTok = `${foreignBody}.${foreignSig}`;
    const v = verifyAgentSessionToken(foreignTok, env, now);
    expect(v.ok).toBe(false);
    expect(v.error).toMatch(/not valid for this app/i);
  });

  it("fails closed when fleet secret missing", () => {
    const now = 13_000_000_000_000;
    const { doc } = setAccess(emptyDoc(), { on: true }, now);
    const r = mintAgentSession(doc, { agentId: "israel" }, {}, now);
    expect(r.ok).toBe(false);
    expect(r.code).toBe("identity_config");
  });

  it("STOP / access off denies mint even if a prior token would still verify by expiry", () => {
    const now = 14_000_000_000_000;
    let doc = setAccess(emptyDoc(), { on: true, timerMode: "manual" }, now).doc;
    const minted = mintAgentSession(doc, { agentId: "dispatch" }, env, now);
    expect(minted.ok).toBe(true);
    expect(verifyAgentSessionToken(minted.token, env, now).ok).toBe(true);
    doc = stopAccess(doc, { actor: "owner-stop" }, now + 1).doc;
    const again = mintAgentSession(doc, { agentId: "dispatch" }, env, now + 2);
    expect(again.ok).toBe(false);
    expect(again.code).toBe("access_off");
    expect(authorizeAgentAction(doc, { agentId: "dispatch" }, now + 2).ok).toBe(false);
  });
});

describe("client status formatting", () => {
  it("formatRemaining", () => {
    expect(formatRemaining(30 * 60 * 1000)).toBe("30 min");
    expect(formatRemaining(90 * 60 * 1000)).toBe("1h 30m");
    expect(formatRemaining(2 * 60 * 60 * 1000)).toBe("2h");
  });

  it("formatAccessStatusLine", () => {
    expect(formatAccessStatusLine({ accessOn: false })).toMatch(/OFF/i);
    expect(formatAccessStatusLine({ accessOn: true, standing: true, timerMode: "manual" })).toMatch(
      /standing/i
    );
    expect(
      formatAccessStatusLine({
        accessOn: true,
        timerMode: "24h",
        remainingMs: 60 * 60 * 1000,
        paymentsOn: true,
      })
    ).toMatch(/Payments/i);
  });
});
