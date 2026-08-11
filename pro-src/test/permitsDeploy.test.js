// Permits Deploy queue — titles, kinds, meter attach, progress next-step.
import { describe, it, expect } from "vitest";
import {
  DEPLOY_KINDS,
  DEPLOY_KIND_OPTIONS,
  formatDeployTitle,
  requestTypeShortLabel,
  caseRunDisplay,
  buildDeployQueueItems,
  processCompletedProgressPatch,
  withDeployDisplayFields,
  queueItemCanDeploy,
  queueItemIsDeploying,
  DEPLOY_QUEUE_COMPLETED_STATUSES,
  getDeployReadiness,
  isReadyToEnqueueDeploy,
  fleetRunIsSupersededSuccess,
  jobConedCaseNumber,
  permitRenewDeployDisplay,
} from "../src/lib/permitsDeploy.js";
import { jobPatchMeterApplication } from "../src/modules/permits/meterApplication.js";
import { REQUEST_TYPES } from "../src/lib/agencyForms/createCaseQuestionnaire.js";

describe("Deploy titles + short load labels", () => {
  it("titles as New Case · Con Edison · service address", () => {
    expect(
      formatDeployTitle({
        kind: "New Case",
        agency: "Con Edison",
        serviceAddress: "1337 President Street",
      })
    ).toBe("New Case · Con Edison · 1337 President Street");
  });

  it("short request labels match Levi wording", () => {
    expect(requestTypeShortLabel(REQUEST_TYPES.ADD_LOAD)).toBe("Additional Load");
    expect(requestTypeShortLabel(REQUEST_TYPES.NO_ADD_LOAD)).toBe("No Additional Load");
    expect(requestTypeShortLabel("No Additional Load")).toBe("No Additional Load");
  });

  it("kind labels cover New Case, Load Letter, New Meter, Electrical Permit, Renew Permit", () => {
    const ids = DEPLOY_KIND_OPTIONS.map((o) => o.id);
    expect(ids).toEqual([
      DEPLOY_KINDS.NEW_CASE,
      DEPLOY_KINDS.LOAD_LETTER,
      DEPLOY_KINDS.NEW_METER,
      DEPLOY_KINDS.ELECTRICAL_PERMIT,
      DEPLOY_KINDS.PERMIT_RENEW,
    ]);
  });
});

describe("queue Deploy button state", () => {
  it("draft/todo/meter/renew can Deploy; fleet running shows Deploying", () => {
    expect(queueItemCanDeploy({ source: "draft", status: "draft", id: "d1" })).toBe(true);
    expect(queueItemCanDeploy({ source: "todo", status: "pending", id: "t1" })).toBe(true);
    expect(queueItemCanDeploy({ source: "meter", status: "deploy_queued", id: "m1" })).toBe(true);
    expect(queueItemCanDeploy({ source: "permit_renew", status: "ready", id: "r1" })).toBe(true);
    expect(queueItemCanDeploy({ source: "permit_renew", status: "deploying", id: "r2" })).toBe(
      false
    );
    expect(queueItemCanDeploy({ source: "fleet", status: "queued", id: "f1" })).toBe(false);
    expect(queueItemCanDeploy({ source: "fleet", status: "awaiting_approval", id: "f2" })).toBe(
      false
    );
    expect(queueItemIsDeploying({ source: "fleet", status: "in_progress", id: "f3" })).toBe(true);
    expect(queueItemIsDeploying({ source: "draft", status: "draft", id: "d2" }, { d2: true })).toBe(
      true
    );
    expect(queueItemIsDeploying({ source: "permit_renew", status: "deploying", id: "r3" })).toBe(
      true
    );
  });
});

describe("caseRunDisplay", () => {
  it("prefers payload displayTitle and short request type", () => {
    const disp = caseRunDisplay(
      {
        type: "create_case",
        payload: {
          displayTitle: "New Case · Con Edison · 1337 President Street",
          requestType: "add_load",
          requestTypeShort: "Additional Load",
          property: { serviceAddress: "1337 President Street" },
        },
      },
      { customer: "President Owner", serviceAddress: "1337 President Street" }
    );
    expect(disp.title).toContain("1337 President");
    expect(disp.requestShort).toBe("Additional Load");
    expect(disp.subtitle).toMatch(/Additional Load/);
  });
});

describe("buildDeployQueueItems", () => {
  it("merges fleet runs + drafts + todos with remove-friendly ids", () => {
    const jobs = [
      {
        id: "j1",
        customer: "President Owner",
        serviceAddress: "1337 President Street",
        paperwork: {
          coned: {
            createCase: {
              status: "draft",
              answers: {
                requestType: "no_add_load",
                serviceAddress: "1337 President Street",
              },
            },
          },
          todos: [
            {
              id: "upload_application:job",
              kind: "upload_application",
              status: "pending",
              title: "Upload application",
            },
          ],
        },
      },
    ];
    const caseRuns = [
      {
        id: "pj-1",
        type: "create_case",
        jobId: "j1",
        status: "queued",
        payload: {
          displayTitle: "New Case · Con Edison · 1337 President Street",
          requestTypeShort: "Additional Load",
          requestType: "add_load",
        },
      },
    ];
    const items = buildDeployQueueItems({ jobs, caseRuns });
    expect(items.some((i) => i.source === "fleet" && i.id === "pj-1")).toBe(true);
    expect(items.some((i) => i.source === "todo")).toBe(true);
    expect(items.every((i) => i.removable)).toBe(true);
    expect(items.filter((i) => i.source === "todo").every((i) => i.expandable)).toBe(true);
    const fleet = items.find((i) => i.id === "pj-1");
    expect(fleet.title).toMatch(/New Case/);
  });

  it("drops completed fleet runs from the Deploy queue", () => {
    const items = buildDeployQueueItems({
      jobs: [],
      caseRuns: [
        {
          id: "done-1",
          type: "create_case",
          jobId: "j1",
          status: "done",
          payload: { displayTitle: "New Case · Con Edison · Done St" },
        },
        {
          id: "sub-1",
          type: "create_case",
          jobId: "j1",
          status: "submitted",
          payload: { displayTitle: "New Case · Con Edison · Sub St" },
        },
        {
          id: "live-1",
          type: "create_case",
          jobId: "j1",
          status: "in_progress",
          payload: { displayTitle: "New Case · Con Edison · Live St" },
        },
      ],
    });
    expect(DEPLOY_QUEUE_COMPLETED_STATUSES.has("done")).toBe(true);
    expect(items.map((i) => i.id)).toEqual(["live-1"]);
  });

  it("hides failed fleet runs when job already has matching Con Ed case (607 MC-941793)", () => {
    const jobs = [
      {
        id: "local-607",
        customer: "Dovber Lipsker",
        serviceAddress: "607 E 53rd St, Brooklyn, NY",
        paperwork: { coned: { caseNumber: "MC-941793" } },
      },
    ];
    const caseRuns = [
      {
        id: "fail-a",
        type: "create_case",
        jobId: "local-607",
        status: "failed",
        caseNumber: "MC-941793",
        error: "superseded — 607 case staged with corrected BIN on newer run",
        payload: {
          displayTitle: "New Case · Con Edison · 607 E 53rd St, Brooklyn, NY",
          requestTypeShort: "No Additional Load",
        },
      },
      {
        id: "fail-b",
        type: "create_case",
        jobId: "local-607",
        status: "failed",
        caseNumber: "MC-941793",
        payload: {
          displayTitle: "New Case · Con Edison · 607 E 53rd St, Brooklyn, NY",
        },
      },
      {
        id: "fail-c",
        type: "create_case",
        jobId: "local-607",
        status: "failed",
        payload: {
          displayTitle: "New Case · Con Edison · 607 E 53rd St, Brooklyn, NY",
        },
      },
    ];
    const items = buildDeployQueueItems({ jobs, caseRuns });
    expect(items.filter((i) => i.source === "fleet")).toEqual([]);
    expect(fleetRunIsSupersededSuccess(caseRuns[0], jobs[0], caseRuns)).toBe(true);
  });

  it("keeps real failed runs when job has no case", () => {
    const items = buildDeployQueueItems({
      jobs: [{ id: "j-bad", serviceAddress: "1 Nowhere" }],
      caseRuns: [
        {
          id: "real-fail",
          type: "create_case",
          jobId: "j-bad",
          status: "failed",
          error: "session_expired",
          payload: { displayTitle: "New Case · Con Edison · 1 Nowhere" },
        },
      ],
    });
    expect(items.map((i) => i.id)).toEqual(["real-fail"]);
  });

  it("puts paid permit renews on Deploy list with full facts", () => {
    const jobs = [
      {
        id: "local-hampton-renew",
        customer: "Yosef Beshari",
        serviceAddress: "40 Hampton Pl",
        invoiceNo: "LE-2702",
        amount: 365,
        paid: true,
        openBalance: 0,
        permitRenew: {
          realTest: true,
          scenarioId: "hampton-yossi",
          permitNo: "B01126007-L1-EL",
          paid: true,
          paidAt: "2026-08-11",
          paidAmount: 365,
          nextStep: "update_permit",
          queueUpdatePermit: true,
          expiresDate: "2025-10-11",
        },
      },
    ];
    const items = buildDeployQueueItems({ jobs, caseRuns: [] });
    const renew = items.find((i) => i.source === "permit_renew");
    expect(renew).toBeTruthy();
    expect(renew.kind).toBe("Renew Permit");
    expect(renew.agency).toBe("DOB");
    expect(renew.title).toMatch(/Renew Permit · DOB · 40 Hampton/);
    expect(renew.subtitle).toMatch(/Yosef Beshari/);
    expect(renew.subtitle).toMatch(/B01126007/);
    expect(renew.subtitle).toMatch(/LE-2702/);
    expect(renew.subtitle).toMatch(/\$365/);
    expect(renew.status).toBe("ready");
    expect(queueItemCanDeploy(renew)).toBe(true);

    const disp = permitRenewDeployDisplay(
      {
        jobId: "local-hampton-renew",
        address: "40 Hampton Pl",
        customer: "Yosef Beshari",
        permitNo: "B01126007-L1-EL",
        invoiceNo: "LE-2702",
        fee: 365,
        paidAt: "2026-08-11",
      },
      jobs[0]
    );
    expect(disp.id).toBe("permit-renew:local-hampton-renew");
    expect(disp.subtitle).toMatch(/Paid 2026-08-11/);
  });
});

describe("getDeployReadiness", () => {
  it("blocks new meter without Form A even if case exists (1337 Ready gate)", () => {
    const r = getDeployReadiness(
      {
        id: "j",
        serviceAddress: "1337 President Street",
        paperwork: { coned: { caseNumber: "MC-941580" } },
      },
      { kind: "new_meter" }
    );
    expect(r.ready).toBe(false);
    expect(r.missing.some((m) => m.id === "form_a")).toBe(true);
    expect(
      isReadyToEnqueueDeploy(
        {
          id: "j",
          serviceAddress: "1337 President Street",
          paperwork: { coned: { caseNumber: "MC-941580" } },
        },
        { kind: "new_meter" }
      )
    ).toBe(false);
  });

  it("ready when Form A + case present", () => {
    const job = {
      id: "j",
      serviceAddress: "10 Main St",
      paperwork: {
        coned: {
          caseNumber: "MC-1",
          application: { status: "submitted" },
        },
      },
    };
    expect(jobConedCaseNumber(job)).toBe("MC-1");
    expect(getDeployReadiness(job, { kind: "new_meter" }).ready).toBe(true);
    expect(isReadyToEnqueueDeploy(job, { kind: "new_meter" })).toBe(true);
  });

  it("requires address", () => {
    const r = getDeployReadiness({ id: "j" }, { kind: "new_meter" });
    expect(r.ready).toBe(false);
    expect(r.missing.some((m) => m.id === "service_address")).toBe(true);
  });
});

describe("new meter → deploy queue + case attach", () => {
  it("queues new meter when Form A ready and attaches existing case number", () => {
    const job = {
      id: "j-m",
      serviceAddress: "555 Kingston Avenue",
      paperwork: {
        coned: {
          caseNumber: "MC-941412",
          application: { status: "submitted" },
        },
      },
    };
    const patch = jobPatchMeterApplication(job, "new_meter");
    expect(patch.paperwork.coned.meterApplication.value).toBe("new_meter");
    expect(patch.paperwork.coned.meterDeploy.status).toBe("deploy_queued");
    expect(patch.paperwork.coned.meterDeploy.attached).toBe(true);
    expect(patch.paperwork.coned.meterDeploy.caseNumber).toBe("MC-941412");
    expect(Array.isArray(patch.paperwork.todos)).toBe(true);
    expect(patch.paperwork.todos.some((t) => t.kind === "new_meter")).toBe(true);
  });

  it("does not put bare new_meter in Deploy queue without case/Form A", () => {
    const patch = jobPatchMeterApplication(
      { id: "j2", serviceAddress: "10 Main" },
      "new_application"
    );
    expect(patch.paperwork.coned.meterDeploy.status).toBe("pending_info");
    expect(patch.paperwork.coned.meterDeploy.attached).toBe(false);
    expect(patch.paperwork.todos || []).toEqual([]);
  });

  it("case alone is pending_info — Ready needs Form A file", () => {
    const patch = jobPatchMeterApplication(
      {
        id: "j3",
        serviceAddress: "10 Main",
        paperwork: { coned: { caseNumber: "MC-1" } },
      },
      "new_meter"
    );
    expect(patch.paperwork.coned.meterDeploy.status).toBe("pending_info");
  });

  it("queues when Form A submitted + address", () => {
    const patch = jobPatchMeterApplication(
      {
        id: "j4",
        serviceAddress: "10 Main",
        paperwork: {
          coned: {
            caseNumber: "MC-1",
            application: { status: "submitted" },
          },
        },
      },
      "new_meter"
    );
    expect(patch.paperwork.coned.meterDeploy.status).toBe("deploy_queued");
  });
});

describe("processCompletedProgressPatch", () => {
  it("marks Paperwork done and seeds Electrical Permit next step", () => {
    const job = {
      id: "j3",
      serviceAddress: "100 Test Ave",
      status: {},
      paperwork: { todos: [] },
    };
    const { patch, addedNext } = processCompletedProgressPatch(job, {
      kind: "create_case",
      permitStage: "application_filed",
    });
    expect(patch.status?.Paperwork?.s).toBe("done");
    expect(addedNext).toBe(true);
    expect(patch.paperwork.todos.some((t) => t.kind === "file_electrical_permit")).toBe(true);
  });
});

describe("withDeployDisplayFields", () => {
  it("adds displayTitle and Additional Load short label", () => {
    const p = withDeployDisplayFields(
      {
        requestType: "add_load",
        property: { serviceAddress: "1337 President Street" },
      },
      { customer: "X" }
    );
    expect(p.displayTitle).toBe("New Case · Con Edison · 1337 President Street");
    expect(p.requestTypeShort).toBe("Additional Load");
    expect(p.deployKind).toBe("new_case");
  });
});
