/**
 * Durable Object: AgentAccessState
 * Strongly-consistent access-state record (read-your-writes).
 * One object per app via idFromName(`app:${appId}`).
 *
 * Deploy: cd workers/agent-access-do && npx wrangler deploy
 * Pages binds via script_name = "le-agent-access-do".
 */

const EMPTY = {
  v: 2,
  appId: "le-pro",
  accessOn: false,
  timerMode: "manual",
  autoOffAt: null,
  paymentsOn: false,
  turnedOnAt: null,
  turnedOffAt: null,
  lastChangedAt: null,
  audit: [],
};

function refresh(doc, now = Date.now()) {
  const next = { ...EMPTY, ...doc, audit: Array.isArray(doc?.audit) ? doc.audit : [] };
  if (!next.accessOn) return next;
  if (next.timerMode === "24h" && next.autoOffAt && now >= Number(next.autoOffAt)) {
    const audit = next.audit.slice();
    audit.unshift({
      at: now,
      type: "auto_off",
      note: "24-hour automatic turn-off (DO alarm / refresh)",
    });
    if (audit.length > 80) audit.length = 80;
    return {
      ...next,
      accessOn: false,
      paymentsOn: false,
      autoOffAt: null,
      turnedOffAt: now,
      lastChangedAt: now,
      audit,
    };
  }
  return next;
}

export class AgentAccessState {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async getDoc() {
    const raw = (await this.state.storage.get("doc")) || EMPTY;
    return refresh(raw);
  }

  async putDoc(doc) {
    const fresh = refresh(doc);
    await this.state.storage.put("doc", fresh);
    // Schedule DO alarm for auto-off when 24h mode is active
    if (fresh.accessOn && fresh.timerMode === "24h" && fresh.autoOffAt) {
      try {
        await this.state.storage.setAlarm(Number(fresh.autoOffAt));
      } catch {
        /* alarm optional on some runtimes */
      }
    } else {
      try {
        await this.state.storage.deleteAlarm();
      } catch {
        /* ignore */
      }
    }
    return fresh;
  }

  async alarm() {
    const doc = await this.getDoc();
    if (doc.accessOn) {
      await this.putDoc({
        ...doc,
        accessOn: false,
        paymentsOn: false,
        autoOffAt: null,
        turnedOffAt: Date.now(),
        lastChangedAt: Date.now(),
        audit: [
          { at: Date.now(), type: "auto_off", note: "24-hour automatic turn-off (DO alarm)" },
          ...(Array.isArray(doc.audit) ? doc.audit : []),
        ].slice(0, 80),
      });
    }
  }

  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "GET" || path.endsWith("/state") && request.method === "GET") {
      const doc = await this.getDoc();
      // Persist auto-off side effects so next read is stable
      if (doc !== (await this.state.storage.get("doc"))) {
        await this.state.storage.put("doc", doc);
      }
      return Response.json(doc);
    }

    if (request.method === "PUT" || request.method === "POST") {
      let body = {};
      try {
        body = await request.json();
      } catch {
        body = {};
      }
      const next = body.doc || body;
      const saved = await this.putDoc(next);
      return Response.json(saved);
    }

    return new Response("method not allowed", { status: 405 });
  }
}

export default {
  async fetch() {
    return new Response("le-agent-access-do · AgentAccessState Durable Object", {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  },
};
