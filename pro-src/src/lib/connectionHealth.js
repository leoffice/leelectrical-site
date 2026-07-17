import { functionsBase } from "./functionsBase.js";

const base = () => functionsBase();

async function getJson(path) {
  const res = await fetch(`${base()}/${path}`, { cache: "no-store" });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 200) };
  }
  return { ok: res.ok, status: res.status, body };
}

/**
 * Live connection checks for Settings → Connections.
 * Never exposes secret values — only ok / missing / error status.
 */
export async function probeConnections() {
  const out = {
    calendar: { ok: false, detail: "" },
    email: { ok: false, detail: "" },
    cardEntry: { ok: false, detail: "" },
    checkedAt: Date.now(),
  };

  try {
    const cal = await getJson(`calendar?cb=${Date.now()}`);
    const sa = Number(cal.body?.syncedAt || 0);
    const n = Array.isArray(cal.body?.events) ? cal.body.events.length : 0;
    const ageMin = sa ? Math.round((Date.now() - sa) / 60000) : null;
    if (cal.ok && sa && ageMin != null && ageMin < 60) {
      out.calendar = {
        ok: true,
        detail: `${n} appointments · synced ${ageMin < 1 ? "just now" : ageMin + " min ago"}`,
        syncedAt: sa,
        events: n,
      };
    } else if (cal.ok && sa) {
      out.calendar = {
        ok: false,
        detail: `Stale — last sync ${ageMin} min ago (${n} appointments). Tap refresh on Calendar.`,
        syncedAt: sa,
        events: n,
      };
    } else {
      out.calendar = { ok: false, detail: "Could not read the calendar store." };
    }
  } catch (e) {
    out.calendar = { ok: false, detail: String(e.message || e) };
  }

  try {
    const res = await fetch(`${base()}/send-doc-email?cb=${Date.now()}`, {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "invoice",
        officeOnly: true,
        probe: true,
        to: "office@leelectrical.us",
        subject: "probe",
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (body && body.ok && body.probe) {
      if (body.hasResendKey) {
        out.email = {
          ok: true,
          detail: `Ready · from ${body.from || "payments@leelectrical.us"}`,
          hasResendKey: true,
        };
      } else {
        out.email = {
          ok: false,
          detail: "Email path is up, but the send key is not installed on the server yet.",
          hasResendKey: false,
        };
      }
    } else {
      out.email = {
        ok: false,
        detail: (body && (body.error || body.reason)) || `HTTP ${res.status}`,
      };
    }
  } catch (e) {
    out.email = { ok: false, detail: String(e.message || e) };
  }

  try {
    const card = await getJson(`sola-ifields-config?cb=${Date.now()}`);
    if (card.ok && card.body?.ok && card.body?.ifieldsKey) {
      out.cardEntry = {
        ok: true,
        detail: `Card entry ready (${card.body.environment || "production"})`,
        environment: card.body.environment || "production",
      };
    } else {
      out.cardEntry = {
        ok: false,
        detail:
          (card.body && card.body.error) ||
          "Card entry key not configured on the server — payment link still works from the host.",
      };
    }
  } catch (e) {
    out.cardEntry = { ok: false, detail: String(e.message || e) };
  }

  return out;
}
