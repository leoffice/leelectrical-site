/**
 * Signup step 1 — create the auth user + send the LE Pro verification email.
 *
 * NEW FLOW (2026-07-23): the first screen is LE Pro-branded signup only — NO
 * company name. This endpoint creates the UNCONFIRMED user and emails the
 * verification link + code. The tenant/company is created LATER, on the
 * post-verification onboarding step, via tenant-provision.mjs. So there is NO
 * tenant/config/profile creation here.
 *
 * POST { email, password, ownerName?, cfTurnstileToken }
 *   -> { ok:true, userId, emailSent }
 *
 * The verification email is LE Pro platform-branded (the tenant doesn't exist
 * yet). It carries both the confirm link (action_link) and a 6-digit code
 * (email_otp), and its redirect_to returns the confirmed user to /signup — where
 * signup.html shows the "set up your company" step and calls tenant-provision.
 *
 * SECURITY: SUPABASE_SERVICE_ROLE_KEY server-only; FAIL-CLOSED behind
 * SIGNUP_ENABLED; Turnstile bot gate; email via Resend. Env read at call time.
 */

const SB_URL = () => process.env.SUPABASE_URL || "https://scgpxbubakfwypycugoa.supabase.co";
const SVC_KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const signupEnabled = () =>
  process.env.SIGNUP_ENABLED === "1" || process.env.SIGNUP_ENABLED === "true";
// After clicking confirm, land back on the signup page → the company step.
const SIGNUP_REDIRECT = () => process.env.SIGNUP_REDIRECT_URL || "https://www.leelectrical.us/signup";
const MAIL_FROM = () => process.env.SIGNUP_FROM || "LE Pro <office@leelectrical.us>";
const LOGO_URL = () => process.env.LEPRO_LOGO_URL || "https://www.leelectrical.us/lepro-logo.png";
const SUPPORT_EMAIL = () => process.env.SUPPORT_EMAIL || "office@leelectrical.us";

function corsHeaders() {
  return {
    "content-type": "application/json",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST,OPTIONS",
    "access-control-allow-headers": "content-type",
  };
}
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders() });

const svc = (path, init = {}) =>
  fetch(`${SB_URL()}${path}`, {
    ...init,
    headers: {
      apikey: SVC_KEY(),
      Authorization: `Bearer ${SVC_KEY()}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

// ---- Turnstile bot gate ----------------------------------------------------
async function verifyTurnstile(token, ip) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { ok: false, reason: "captcha not configured" };
  if (!token) return { ok: false, reason: "missing token" };
  const form = new URLSearchParams();
  form.set("secret", secret);
  form.set("response", token);
  if (ip) form.set("remoteip", ip);
  let d = {};
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    d = await r.json();
  } catch (e) {
    return { ok: false, reason: `verify unreachable: ${e.message}` };
  }
  return { ok: d.success === true, reason: (d["error-codes"] || []).join(",") };
}

// ---- LE Pro verification email (platform-branded) via Resend ---------------
function verificationEmailHtml({ ownerName, actionLink, otpCode }) {
  const name = (ownerName && String(ownerName).replace(/[<>]/g, "").trim()) || "there";
  const logo = LOGO_URL();
  const support = SUPPORT_EMAIL();
  const code = String(otpCode || "").replace(/[^0-9]/g, "");
  return `<!doctype html><html><body style="margin:0;padding:0;background:#eef2f6;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Welcome to LE Pro — confirm your email to continue, then set up your company.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f6;"><tr><td align="center" style="padding:28px 12px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;">
      <tr><td align="center" style="background:#f4f8f4;border-radius:16px 16px 0 0;padding:26px 32px 22px;">
        <img src="${logo}" alt="LE Pro" width="104" style="width:104px;max-width:104px;height:auto;display:block;border:0;outline:none;">
      </td></tr>
      <tr><td style="background:#ffffff;padding:32px 32px 8px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <h1 style="margin:0 0 8px;font-size:26px;line-height:1.25;font-weight:800;color:#111827;">Welcome to LE Pro 🎉</h1>
        <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#374151;">Hi ${name}, congratulations — your LE Pro account is almost ready. Confirm your email to continue, then you'll add your company details to finish setup.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 20px;"><tr><td align="center" bgcolor="#2d8a3e" style="border-radius:10px;">
          <a href="${actionLink}" style="display:inline-block;padding:14px 34px;font-size:16px;font-weight:700;color:#ffffff;background:#2d8a3e;border-radius:10px;text-decoration:none;">Confirm my email</a>
        </td></tr></table>
        <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#6b7280;">Or enter this verification code on the confirmation screen:</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6faf7;border:1px solid #dbebe0;border-radius:12px;margin:0 0 20px;"><tr><td align="center" style="padding:14px 18px;">
          <div style="font-family:'Courier New',monospace;font-size:30px;font-weight:800;letter-spacing:9px;color:#111827;">${code}</div>
        </td></tr></table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef6f0;border:1px solid #d7ebde;border-radius:12px;margin:0 0 20px;"><tr><td style="padding:14px 18px;">
          <div style="font-size:13px;color:#2d8a3e;font-weight:800;letter-spacing:.3px;margin-bottom:3px;">NEXT STEP</div>
          <div style="font-size:14px;color:#374151;line-height:1.55;">After confirming, you'll set up your company — name, branding, and plan — and you're in.</div>
        </td></tr></table>
        <p style="margin:0 0 4px;font-size:12px;line-height:1.6;color:#6b7280;">This link and code expire in 24 hours. If the button doesn't work, paste this URL into your browser:</p>
        <p style="margin:0 0 20px;font-size:12px;line-height:1.5;word-break:break-all;"><a href="${actionLink}" style="color:#2d8a3e;">${actionLink}</a></p>
        <hr style="border:0;border-top:1px solid #eceff3;margin:4px 0 16px;">
        <p style="margin:0 0 20px;font-size:13px;line-height:1.6;color:#6b7280;">Didn't sign up for LE Pro? You can safely ignore this email — no account is activated until it's confirmed. Questions? Contact <a href="mailto:${support}" style="color:#2d8a3e;">${support}</a>.</p>
      </td></tr>
      <tr><td style="background:#ffffff;border-radius:0 0 16px 16px;padding:0 32px 26px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <div style="border-top:1px solid #eceff3;padding-top:16px;"><p style="margin:0;font-size:12px;line-height:1.6;color:#9aa4b2;">LE Pro · Field &amp; office management for contractors.<br>${support}</p></div>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}

async function sendVerificationEmail(to, ownerName, actionLink, otpCode) {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  if (!apiKey) return { ok: false, reason: "no RESEND_API_KEY" };
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: MAIL_FROM(),
        to: [to],
        subject: "Welcome to LE Pro — confirm your email",
        html: verificationEmailHtml({ ownerName, actionLink, otpCode }),
      }),
    });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, reason: `resend ${r.status}`, detail: b };
    return { ok: true, id: b.id };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

async function emailExists(email) {
  for (let page = 1; page <= 20; page++) {
    const r = await svc(`/auth/v1/admin/users?page=${page}&per_page=200`);
    if (!r.ok) throw new Error(`user lookup failed: HTTP ${r.status}`);
    const { users = [] } = await r.json();
    if (users.some((u) => (u.email || "").toLowerCase() === email.toLowerCase())) return true;
    if (users.length < 200) break;
  }
  return false;
}

export default async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  if (!SVC_KEY()) return json({ ok: false, error: "server not configured" }, 500);
  if (!signupEnabled()) return json({ ok: false, error: "signups are not open" }, 403);

  let body = {};
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid JSON" }, 400);
  }

  // Bot gate first.
  const ip =
    req.headers.get("cf-connecting-ip") ||
    (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  const cap = await verifyTurnstile(body.cfTurnstileToken || body.turnstileToken, ip);
  if (!cap.ok) return json({ ok: false, error: `captcha failed${cap.reason ? ` (${cap.reason})` : ""}` }, 400);

  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const ownerName = String(body.ownerName || "").trim();

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ ok: false, error: "valid email required" }, 400);
  if (password.length < 8) return json({ ok: false, error: "password must be at least 8 characters" }, 400);

  try {
    if (await emailExists(email)) return json({ ok: false, error: "an account with that email already exists" }, 409);
  } catch (e) {
    return json({ ok: false, error: `signup unavailable: ${e.message}` }, 502);
  }

  // Create the UNCONFIRMED user + get the confirmation link + code. No tenant.
  const r = await svc(`/auth/v1/admin/generate_link`, {
    method: "POST",
    body: JSON.stringify({
      type: "signup",
      email,
      password,
      data: ownerName ? { full_name: ownerName } : {},
      redirect_to: SIGNUP_REDIRECT(),
    }),
  });
  if (!(r.status === 200 || r.status === 201))
    return json({ ok: false, error: `create user failed: HTTP ${r.status} ${(await r.text()).slice(0, 160)}` }, 502);
  const gl = await r.json();
  const userId = gl?.user?.id || gl?.id || gl?.user_id;
  const actionLink = gl?.action_link || gl?.properties?.action_link;
  const otpCode = gl?.email_otp || gl?.properties?.email_otp || "";
  if (!userId || !actionLink) return json({ ok: false, error: "signup could not be initialized" }, 502);

  const mail = await sendVerificationEmail(email, ownerName, actionLink, otpCode);
  return json({ ok: true, userId, emailSent: mail.ok, emailReason: mail.ok ? undefined : mail.reason });
};
