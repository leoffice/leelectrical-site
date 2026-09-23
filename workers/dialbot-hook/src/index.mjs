/**
 * le-dialbot-hook — Twilio voice for spare DID +17185502330 only.
 * SAS-style: answer (/twilio/voice) → next from Dial action (/twilio/voice-next).
 * Patterned on workers/helen-hook. Do NOT wire Helen 320/920 here.
 */
const SPARE_DID = "+17185502330";
// From helen-hook: HELEN_DID (320 Bland) + TWILIO_DID (920)
const HELEN_DID = "+13203857608";
const HELEN_TWILIO_DID = "+19208161747";
const FORBIDDEN = new Set(
  [HELEN_DID, HELEN_TWILIO_DID].flatMap((n) => {
    const raw = String(n).replace(/\D/g, "");
    const ten = raw.replace(/^1(?=\d{10}$)/, "");
    return [raw, ten];
  }),
);

function digits(s) {
  return String(s || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
}

function xmlEsc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function twiml(inner) {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`, {
    headers: { "content-type": "text/xml; charset=utf-8", "cache-control": "no-store" },
  });
}

function json(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

async function readParams(req) {
  const url = new URL(req.url);
  const out = Object.fromEntries(url.searchParams.entries());
  if (req.method === "POST") {
    const ct = req.headers.get("content-type") || "";
    if (ct.includes("application/x-www-form-urlencoded")) {
      const body = await req.text();
      for (const [k, v] of new URLSearchParams(body)) out[k] = v;
    } else if (ct.includes("application/json")) {
      try {
        Object.assign(out, await req.json());
      } catch {
        /* ignore */
      }
    }
  }
  return out;
}

function authorized(req, params, env) {
  const key = (env && env.HOOK_KEY) || "";
  if (!key) return false;
  const got = params.k || params.key || new URL(req.url).searchParams.get("k") || "";
  return got === key;
}

function isSpareTo(to) {
  return digits(to) === digits(SPARE_DID);
}

function isForbiddenDid(n) {
  return FORBIDDEN.has(digits(n)) || FORBIDDEN.has(String(n || "").replace(/\D/g, ""));
}

async function twilioForm(env, path, params) {
  const sid = env.TWILIO_ACCOUNT_SID;
  const token = env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return { error: "no_twilio_secret" };
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v != null && v !== "") body.set(k, String(v));
  }
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/${path}`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`${sid}:${token}`),
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const text = await r.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: "bad_json", status: r.status, text: text.slice(0, 200) };
  }
}

async function dialDialbotIntoConf(env, { conf }) {
  const blandDid = env.DIALBOT_BLAND_DID;
  if (!blandDid) return { error: "missing_DIALBOT_BLAND_DID" };
  if (isForbiddenDid(blandDid)) return { error: "forbidden_did_refused_helen" };
  return twilioForm(env, "Calls.json", {
    To: blandDid,
    From: SPARE_DID,
    Twiml: `<Response><Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="false" beep="false">${xmlEsc(conf)}</Conference></Dial></Response>`,
  });
}

async function twilioVoice(req, origin, env, ctx) {
  const params = await readParams(req);
  if (!authorized(req, params, env)) return json({ ok: false, error: "unauthorized" }, 401);

  const to = params.To || params.to || "";
  const from = params.From || params.from || "";
  const callSid = String(params.CallSid || Date.now());

  if (isForbiddenDid(to) || isForbiddenDid(from)) {
    return twiml('<Say voice="Polly.Joanna">This number is not configured.</Say><Hangup/>');
  }
  if (to && !isSpareTo(to)) {
    return twiml('<Say voice="Polly.Joanna">Wrong line.</Say><Hangup/>');
  }

  const conf = "dialbot" + callSid.replace(/[^A-Za-z0-9]/g, "").slice(-24);
  const start = async () => {
    await dialDialbotIntoConf(env, { conf });
  };
  if (/^CA[0-9a-f]{32}$/i.test(callSid)) {
    if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(start());
    else await start();
  }

  const key = encodeURIComponent(env.HOOK_KEY || "");
  // Match helen-hook route names exactly
  const next = `${origin}/twilio/voice-next?k=${key}`;
  const wait = `${origin}/twilio/wait?k=${key}`;
  return twiml(
    `<Dial action="${xmlEsc(next)}" method="POST"><Conference startConferenceOnEnter="true" endConferenceOnExit="true" beep="false" waitUrl="${xmlEsc(wait)}" waitMethod="GET">${xmlEsc(conf)}</Conference></Dial>`,
  );
}

async function twilioVoiceNext(req, env) {
  const params = await readParams(req);
  if (!authorized(req, params, env)) return json({ ok: false, error: "unauthorized" }, 401);
  const status = String(params.DialCallStatus || "").toLowerCase();
  if (status === "busy" || status === "no-answer" || status === "failed") {
    return twiml('<Say voice="Polly.Joanna">Dialbot is unavailable. Goodbye.</Say><Hangup/>');
  }
  return twiml("<Hangup/>");
}

function twilioWait() {
  return twiml('<Pause length="120"/>');
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const origin = url.origin;

    if (path === "/" || path === "/health") {
      return json({
        ok: true,
        service: "dialbot-hook",
        spare: SPARE_DID,
        refuses: [HELEN_DID, HELEN_TWILIO_DID],
      });
    }
    if (path === "/twilio/voice") return twilioVoice(req, origin, env, ctx);
    if (path === "/twilio/voice-next") return twilioVoiceNext(req, env);
    if (path === "/twilio/wait") return twilioWait();
    return json({ ok: false, error: "not_found", path }, 404);
  },
};
