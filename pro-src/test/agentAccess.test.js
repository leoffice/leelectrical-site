// Agent Access — toggle + fleet identity (AGENT_ACCESS_STANDARD).
import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import {
  AUTO_OFF_MS,
  authenticateFleetIdentity,
  authorizeAgentAction,
  emptyDoc,
  gateAgentPaymentAction,
  hasPaymentConfirmation,
  publicAccessState,
  refreshAccessState,
  setAccess,
  setPayments,
  setTimerMode,
  statusPayload,
  stopAccess,
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

  it("statusPayload exposes defaults and no codes", () => {
    const p = statusPayload(emptyDoc());
    expect(p.ok).toBe(true);
    expect(p.defaults.codes).toBe(false);
    expect(p.defaults.model).toMatch(/toggle/);
    expect(p.grant).toBe(null);
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
