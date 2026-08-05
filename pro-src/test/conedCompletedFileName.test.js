import { describe, it, expect } from "vitest";
import {
  buildConedCompletedFileName,
  customerConedApplicationSubject,
  resolveConedMeterLabel,
  filesystemSafeSegment,
} from "../src/lib/agencyForms/completedFileName.js";
import {
  isConedApplicationsEnabled,
  CONED_APPLICATIONS_MODULE,
} from "../src/lib/agencyForms/conedFeatureFlag.js";
import { listConedCompletedFiles } from "../src/lib/agencyForms/completeDestinations.js";

describe("Con Ed completed file naming (§3)", () => {
  it("builds address - PLP - person.pdf (Test-2 style)", () => {
    const name = buildConedCompletedFileName({
      answers: {
        serviceAddress: "555 Kingston Avenue",
        serviceUnit: "PLP",
        accountName: "Test 2",
      },
    });
    expect(name).toBe("555 Kingston Avenue - PLP - Test 2.pdf");
  });

  it("falls back to account name as middle segment when no unit", () => {
    const name = buildConedCompletedFileName({
      answers: {
        serviceAddress: "1127 Lincoln Place",
        accountName: "Partner 1",
      },
    });
    expect(name).toBe("1127 Lincoln Place - Partner 1 - Partner 1.pdf");
  });

  it("strips illegal filesystem characters", () => {
    expect(filesystemSafeSegment('a/b:c*d?"')).not.toMatch(/[\/:*?"]/);
    const name = buildConedCompletedFileName({
      answers: {
        serviceAddress: "12 Main St / Rear",
        serviceUnit: "apt2",
        accountName: 'O"Brien',
      },
    });
    expect(name).toMatch(/\.pdf$/);
    expect(name).not.toMatch(/[<>:"/\\|?*]/);
  });

  it("uses explicit meterLabel over unit", () => {
    expect(
      resolveConedMeterLabel({
        answers: { serviceUnit: "u1" },
        meterLabel: "PLP",
      })
    ).toBe("PLP");
  });

  it("customer subject uses address", () => {
    expect(
      customerConedApplicationSubject(
        { serviceAddress: "555 Kingston Avenue" },
        {}
      )
    ).toBe("Your Con Edison application - 555 Kingston Avenue");
  });
});

describe("Con Ed applications feature flag (Levi-only)", () => {
  it("ON for LE internal / le tenant", () => {
    expect(isConedApplicationsEnabled({ internal: true, tenantId: "le" })).toBe(true);
    expect(isConedApplicationsEnabled({ tenantId: "le" })).toBe(true);
  });

  it("OFF for plain white-label tenant", () => {
    expect(
      isConedApplicationsEnabled({
        tenantId: "ace",
        internal: false,
        modules: { permits: false },
      })
    ).toBe(false);
  });

  it("respects explicit moduleOverrides", () => {
    expect(
      isConedApplicationsEnabled({
        tenantId: "ace",
        moduleOverrides: { [CONED_APPLICATIONS_MODULE]: true },
      })
    ).toBe(true);
    expect(
      isConedApplicationsEnabled({
        tenantId: "le",
        internal: true,
        moduleOverrides: { [CONED_APPLICATIONS_MODULE]: false },
      })
    ).toBe(false);
  });
});

describe("listConedCompletedFiles", () => {
  it("reads completedFiles array", () => {
    const files = listConedCompletedFiles({
      paperwork: {
        coned: {
          completedFiles: [{ name: "a.pdf", status: "submitted" }],
        },
      },
    });
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe("a.pdf");
  });

  it("falls back to single submitted application.completedFile", () => {
    const files = listConedCompletedFiles({
      paperwork: {
        coned: {
          application: {
            status: "submitted",
            filename: "legacy.pdf",
            completedFile: { name: "legacy.pdf", status: "submitted" },
          },
        },
      },
    });
    expect(files[0].name).toBe("legacy.pdf");
  });
});

describe("countReadyConedApplications", () => {
  it("counts unuploaded completed files and prefers slim appsReady", async () => {
    const { countReadyConedApplications } = await import(
      "../src/lib/agencyForms/completeDestinations.js"
    );
    expect(
      countReadyConedApplications({
        paperwork: {
          coned: {
            completedFiles: [
              { name: "a.pdf" },
              { name: "b.pdf", uploadedAt: "2026-08-01" },
            ],
          },
        },
      })
    ).toBe(1);
    expect(countReadyConedApplications({ appsReady: 3 })).toBe(3);
    expect(
      countReadyConedApplications({
        paperwork: {
          todos: [{ kind: "upload_application", status: "pending" }],
          coned: { uploadDocument: { status: "file_ready" } },
        },
      })
    ).toBe(1);
  });
});
