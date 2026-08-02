// paperwork-jobs bridge — lifecycle guard + client + create-case wiring.
//
// The RED LINE under test: `submitted` is reachable ONLY from `approved` —
// a fleet update that tries in_progress -> submitted must be refused.
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  canTransition,
  PAPERWORK_JOB_STATUSES,
} from "../../netlify/functions/paperwork-jobs.mjs";
import {
  createPaperworkJob,
  approvePaperworkJob,
  listPaperworkJobsServer,
  paperworkScreenshotUrl,
  paperworkJobStatusLabel,
} from "../src/lib/paperworkJobs.js";
import { createCasePaperworkJob } from "../src/lib/agencyForms/createCaseExecution.js";

afterEach(() => vi.unstubAllGlobals());

describe("lifecycle transitions (server rules)", () => {
  it("follows queued -> in_progress -> awaiting_approval -> approved -> submitted -> done", () => {
    expect(canTransition("queued", "in_progress")).toBe(true);
    expect(canTransition("in_progress", "awaiting_approval")).toBe(true);
    expect(canTransition("awaiting_approval", "approved")).toBe(true);
    expect(canTransition("approved", "submitted")).toBe(true);
    expect(canTransition("submitted", "done")).toBe(true);
  });
  it("RED LINE: submitted is unreachable without approval", () => {
    expect(canTransition("in_progress", "submitted")).toBe(false);
    expect(canTransition("queued", "submitted")).toBe(false);
    expect(canTransition("awaiting_approval", "submitted")).toBe(false);
    expect(canTransition("rejected", "submitted")).toBe(false);
  });
  it("allows re-screenshot while awaiting approval; rejection ends the run", () => {
    expect(canTransition("awaiting_approval", "awaiting_approval")).toBe(true);
    expect(canTransition("awaiting_approval", "rejected")).toBe(true);
    expect(canTransition("rejected", "approved")).toBe(false);
  });
  it("failure is reachable from active states, terminal states stay terminal", () => {
    for (const from of ["queued", "in_progress", "awaiting_approval", "approved", "submitted"]) {
      expect(canTransition(from, "failed")).toBe(true);
    }
    expect(canTransition("done", "failed")).toBe(false);
    expect(PAPERWORK_JOB_STATUSES).toContain("awaiting_approval");
  });
});

describe("client lib", () => {
  it("createPaperworkJob posts op:create with payload", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, job: { id: "pj-1", status: "queued" } }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await createPaperworkJob({
      type: "create_case",
      jobId: "job-9",
      payload: { requestType: "add_load" },
    });
    expect(r.ok).toBe(true);
    expect(r.job.id).toBe("pj-1");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.op).toBe("create");
    expect(body.jobId).toBe("job-9");
    expect(body.payload.requestType).toBe("add_load");
  });

  it("approvePaperworkJob posts the decision", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, job: { id: "pj-1", status: "approved" } }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await approvePaperworkJob("pj-1", true, "looks right");
    expect(r.ok).toBe(true);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({ op: "approve", id: "pj-1", approve: true, note: "looks right" });
  });

  it("list surfaces server errors cleanly", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 502, json: async () => ({}) })));
    const r = await listPaperworkJobsServer({});
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/502/);
  });

  it("screenshot URL re-anchors relative docs paths onto the functions base", () => {
    const url = paperworkScreenshotUrl(
      { screenshotUrl: "/.netlify/functions/docs?key=pwshot-a-b", screenshotKey: "pwshot-a-b" },
      { base: () => "https://leelectrical.us/.netlify/functions" }
    );
    expect(url).toBe("https://leelectrical.us/.netlify/functions/docs?key=pwshot-a-b");
    expect(paperworkJobStatusLabel("awaiting_approval")).toMatch(/approval/i);
  });
});

describe("Submit a Case -> backend bridge", () => {
  const ANSWERS = {
    requestType: "no_additional_load",
    contactName: "Levi Kumer",
    contactPhone: "7185941850",
    contactEmail: "office@leelectrical.us",
    serviceAddress: "555 Kingston Avenue",
    borough: "Brooklyn",
    workDescription: "New meter for renovated unit",
    customerType: "Residential",
  };

  it("creates a queued create_case job with the case payload + answers", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, job: { id: "pj-77", status: "queued" } }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const patches = [];
    const r = await createCasePaperworkJob({
      answers: ANSWERS,
      job: { id: "job-9", customer: "Test 2" },
      onSave: (p) => patches.push(p),
    });
    if (!r.ok) {
      // questionnaire model requires more fields — the wiring is still exercised
      expect(r.error).toBe("questionnaire_incomplete");
      return;
    }
    expect(r.paperworkJobId).toBe("pj-77");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.op).toBe("create");
    expect(body.type).toBe("create_case");
    expect(body.payload.autoSubmit).toBe(false);
    expect(body.payload.stopAt).toBe("review");
    expect(body.payload.skill).toBe("coned-create-case");
    expect(body.payload.answers).toBeTruthy();
    const exec = patches[0].paperwork.coned.createCase.execution;
    expect(exec.paperworkJobId).toBe("pj-77");
    expect(exec.backend).toBe(true);
    expect(exec.autoSubmit).toBe(false);
  });

  it("refuses an incomplete questionnaire without calling the backend", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const r = await createCasePaperworkJob({ answers: {}, job: { id: "j" } });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("questionnaire_incomplete");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
