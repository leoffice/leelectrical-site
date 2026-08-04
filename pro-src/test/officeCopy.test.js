import { describe, it, expect } from "vitest";
import { OFFICE_EMAIL, applyOfficeBcc } from "../../netlify/functions/lib/officeCopy.mjs";

describe("applyOfficeBcc — silent office copy for LE Pro tabs", () => {
  it("adds office@ bcc on a real customer send", () => {
    const payload = { to: ["customer@example.com"], subject: "Hi" };
    applyOfficeBcc(payload, { recipients: ["customer@example.com"], testMode: false });
    expect(payload.bcc).toEqual([OFFICE_EMAIL]);
  });

  it("skips when already office-only", () => {
    const payload = { to: [OFFICE_EMAIL] };
    applyOfficeBcc(payload, { recipients: [OFFICE_EMAIL], officeOnly: false });
    expect(payload.bcc).toBeUndefined();
  });

  it("skips in test mode", () => {
    const payload = { to: ["customer@example.com"] };
    applyOfficeBcc(payload, { recipients: ["customer@example.com"], testMode: true });
    expect(payload.bcc).toBeUndefined();
  });

  it("skips officeOnly guard", () => {
    const payload = { to: ["customer@example.com"] };
    applyOfficeBcc(payload, {
      recipients: ["customer@example.com"],
      officeOnly: true,
      testMode: false,
    });
    expect(payload.bcc).toBeUndefined();
  });

  it("does not double-add when office already on to", () => {
    const payload = { to: ["customer@example.com", OFFICE_EMAIL] };
    applyOfficeBcc(payload, {
      recipients: ["customer@example.com", OFFICE_EMAIL],
      testMode: false,
    });
    expect(payload.bcc).toBeUndefined();
  });
});
