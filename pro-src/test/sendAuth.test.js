// Regression — Levi 2026-08-12 security batch: outbound-email endpoints must
// reject anonymous POSTs (anyone could send branded mail from office@), while
// the app key / signed-in tenant paths keep working, and multi-address on-file
// emails ("a@x, b@y") reach EVERY address instead of silently dropping all but
// the first.
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { authorizeSend } from "../../netlify/functions/lib/sendAuth.mjs";
import { sendCustomerEmail } from "../../netlify/functions/lib/customerEmail.mjs";
import customerEmailHandler from "../../netlify/functions/customer-email.mjs";
import sendDocEmailHandler from "../../netlify/functions/send-doc-email.mjs";
import { _clearTenantCache } from "../../netlify/functions/lib/tenant.mjs";

const KEY = "test-send-key-123";

function req(headers = {}, body = { email: "x@y.com", message: "hi" }) {
  return new Request("https://leelectrical.us/.netlify/functions/customer-email", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("authorizeSend gate", () => {
  const env = process.env;
  beforeEach(() => {
    process.env = { ...env };
    process.env.CUSTOMER_EMAIL_KEY = KEY;
    _clearTenantCache();
  });
  afterEach(() => {
    process.env = env;
    vi.unstubAllGlobals();
  });

  it("rejects anonymous requests with 401", async () => {
    const r = await authorizeSend(req());
    expect(r.ok).toBe(false);
    expect(r.status).toBe(401);
  });

  it("rejects a wrong key with 401", async () => {
    const r = await authorizeSend(req({ "x-le-email-key": "wrong" }));
    expect(r.ok).toBe(false);
    expect(r.status).toBe(401);
  });

  it("accepts the configured app key", async () => {
    const r = await authorizeSend(req({ "x-le-email-key": KEY }));
    expect(r.ok).toBe(true);
    expect(r.via).toBe("key");
  });

  it("fails closed (503) when no key is configured server-side", async () => {
    delete process.env.CUSTOMER_EMAIL_KEY;
    const r = await authorizeSend(req());
    expect(r.ok).toBe(false);
    expect(r.status).toBe(503);
  });

  it("accepts a Bearer token that resolves to a tenant", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify([{ tenant_id: "le" }]), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )
    );
    const r = await authorizeSend(req({ authorization: "Bearer tok-abc" }));
    expect(r.ok).toBe(true);
    expect(r.via).toBe("token");
    expect(r.tenant).toBe("le");
  });

  it("rejects a Bearer token that does NOT resolve (fail closed)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("[]", { status: 401 }))
    );
    const r = await authorizeSend(req({ authorization: "Bearer bad-tok" }));
    expect(r.ok).toBe(false);
    expect(r.status).toBe(401);
  });
});

describe("customer-email endpoint auth", () => {
  const env = process.env;
  beforeEach(() => {
    process.env = { ...env };
    process.env.CUSTOMER_EMAIL_KEY = KEY;
    delete process.env.RESEND_API_KEY;
    process.env.EMAIL_TEST_MODE = "false";
  });
  afterEach(() => {
    process.env = env;
  });

  it("401s an unauthenticated POST", async () => {
    const res = await customerEmailHandler(req());
    expect(res.status).toBe(401);
  });

  it("processes an app-key POST (dry-run without RESEND key)", async () => {
    const res = await customerEmailHandler(req({ "x-le-email-key": KEY }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.dryRun).toBe(true);
  });

  it("401s an unauthenticated send-doc-email POST too", async () => {
    const res = await sendDocEmailHandler(
      new Request("https://leelectrical.us/.netlify/functions/send-doc-email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "invoice", probe: true, to: "a@b.com" }),
      })
    );
    expect(res.status).toBe(401);
  });
});

describe("multi-address recipients (Gabriel/Renco/LMR shape)", () => {
  const env = process.env;
  beforeEach(() => {
    process.env = { ...env };
    delete process.env.RESEND_API_KEY;
    process.env.EMAIL_TEST_MODE = "false";
  });
  afterEach(() => {
    process.env = env;
  });

  it("keeps every valid address — split, trim, dedupe", async () => {
    const r = await sendCustomerEmail({
      to: "payables@rancomgmt.com, Louis@rancomgmt.com; louis@rancomgmt.com",
      subject: "Renewal",
      message: "notice",
    });
    expect(r.ok).toBe(true);
    expect(r.dryRun).toBe(true);
    expect(r.recipientCount).toBe(2);
    expect(r.to).toBe("payables@rancomgmt.com, Louis@rancomgmt.com");
  });

  it("test mode still routes to the single test inbox", async () => {
    process.env.EMAIL_TEST_MODE = "true";
    process.env.PAYMENT_CONFIRM_TEST_EMAIL = "levi@test.com";
    const r = await sendCustomerEmail({
      to: "a@x.com, b@y.com",
      subject: "Renewal",
      message: "notice",
    });
    expect(r.recipientCount).toBe(1);
    expect(r.to).toBe("levi@test.com");
  });
});
