import { describe, expect, it } from "vitest";
import {
  appointmentContactInfo,
  emailHref,
  googleMapsHref,
  phoneHref,
} from "../src/lib/contactLinks.js";

describe("contactLinks", () => {
  it("builds phone, maps, and mailto hrefs", () => {
    expect(phoneHref("(718) 555-0100")).toBe("tel:7185550100");
    expect(phoneHref("")).toBe("");
    expect(googleMapsHref("123 Main St")).toContain("google.com/maps");
    expect(googleMapsHref("123 Main St")).toContain(encodeURIComponent("123 Main St"));
    expect(emailHref("a@b.com")).toMatch(/mailto:a@b.com|mail\.google\.com/);
  });

  it("prefers linked job contact over prefill", () => {
    const info = appointmentContactInfo(
      { location: "99 Oak" },
      { phone: "718-111-2222", email: "job@x.com", serviceAddress: "1 Job St" },
      { phone: "000", email: "pre@x.com", serviceAddress: "2 Prefill St" }
    );
    expect(info.phone).toBe("718-111-2222");
    expect(info.email).toBe("job@x.com");
    expect(info.address).toBe("99 Oak");
  });

  it("falls back to prefill when no job", () => {
    const info = appointmentContactInfo(
      {},
      null,
      { phone: "718-333-4444", email: "p@x.com", serviceAddress: "7 Prefill Ave" }
    );
    expect(info.phone).toBe("718-333-4444");
    expect(info.email).toBe("p@x.com");
    expect(info.address).toBe("7 Prefill Ave");
  });
});
