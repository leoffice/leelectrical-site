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

  it("kind labels still cover New Case, Load Letter, New Meter, Electrical Permit", () => {
    const ids = DEPLOY_KIND_OPTIONS.map((o) => o.id);
    expect(ids).toEqual([
      DEPLOY_KINDS.NEW_CASE,
      DEPLOY_KINDS.LOAD_LETTER,
      DEPLOY_KINDS.NEW_METER,
      DEPLOY_KINDS.ELECTRICAL_PERMIT,
    ]);
  });
});

describe("queue Deploy button state", () => {
  it("draft/todo/meter can Deploy; fleet running shows Deploying", () => {
    expect(queueItemCanDeploy({ source: "draft", status: "draft", id: "d1" })).toBe(true);
    expect(queueItemCanDeploy({ source: "todo", status: "pending", id: "t1" })).toBe(true);
    expect(queueItemCanDeploy({ source: "meter", status: "deploy_queued", id: "m1" })).toBe(true);
    expect(queueItemCanDeploy({ source: "fleet", status: "queued", id: "f1" })).toBe(false);
    expect(queueItemCanDeploy({ source: "fleet", status: "awaiting_approval", id: "f2" })).toBe(
      false
    );
    expect(queueItemIsDeploying({ source: "fleet", status: "in_progress", id: "f3" })).toBe(true);
    expect(queueItemIsDeploying({ source: "draft", status: "draft", id: "d2" }, { d2: true })).toBe(
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
});

describe("new meter → deploy queue + case attach", () => {
  it("queues new meter and attaches existing case number", () => {
    const job = {
      id: "j-m",
      serviceAddress: "555 Kingston Avenue",
      paperwork: { coned: { caseNumber: "MC-941412" } },
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

  it("queues when case number exists", () => {
    const patch = jobPatchMeterApplication(
      {
        id: "j3",
        serviceAddress: "10 Main",
        paperwork: { coned: { caseNumber: "MC-1" } },
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
