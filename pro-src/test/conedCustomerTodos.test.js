import { describe, it, expect } from "vitest";
import {
  parseConedTodoListFromEmail,
  jobPatchFromConedCustomerTodos,
  seedConedCustomerTodos,
  conedTodoTapResult,
  CONED_CUSTOMER_TODO_KINDS,
} from "../src/lib/conedCustomerTodos.js";

describe("parseConedTodoListFromEmail", () => {
  it("extracts Application for Service + Final Checklist from body", () => {
    const items = parseConedTodoListFromEmail({
      subject: "Status Update for Customer To-Do List- 1127 LINCOLN PLACE [MC-941412]",
      body: `Date: August 4, 2026
Service At: 1127 Lincoln Place
Case Number: MC-941412
The following documentation has been Requested and is Pending your Submission
Document Name Status
Application for Service Pending
Electric Certificate Pending
Final Checklist Pending
`,
    });
    const kinds = items.map((i) => i.kind);
    expect(kinds).toContain(CONED_CUSTOMER_TODO_KINDS.APPLICATION_FOR_SERVICE);
    expect(kinds).toContain(CONED_CUSTOMER_TODO_KINDS.ELECTRIC_CERTIFICATE);
    expect(kinds).toContain(CONED_CUSTOMER_TODO_KINDS.FINAL_CHECKLIST);
  });
});

describe("jobPatchFromConedCustomerTodos", () => {
  it("gates final checklist until app + certificate done", () => {
    const seed = seedConedCustomerTodos([
      "Application for Service",
      "Electric Certificate",
      "Final Checklist",
    ]);
    const patch = jobPatchFromConedCustomerTodos(
      { id: "j1", serviceAddress: "1127 Lincoln Place", paperwork: { coned: { caseNumber: "MC-941412" } } },
      seed,
      { caseNumber: "MC-941412" }
    );
    const list = patch.paperwork.coned.customerTodos;
    const final = list.find((t) => t.kind === CONED_CUSTOMER_TODO_KINDS.FINAL_CHECKLIST);
    expect(final.status).toBe("blocked");
    expect(patch.paperwork.todos.some((t) => t.kind === "file_electrical_permit")).toBe(true);
  });

  it("unlocks final checklist when both prereqs done", () => {
    const job = {
      id: "j1",
      paperwork: {
        coned: {
          caseNumber: "MC-1",
          customerTodos: [
            { kind: "application_for_service", status: "done", title: "Application for Service" },
            { kind: "electric_certificate", status: "done", title: "Electric Certificate" },
            { kind: "final_checklist", status: "blocked", title: "Final Checklist" },
          ],
        },
      },
    };
    const patch = jobPatchFromConedCustomerTodos(job, [
      { kind: "final_checklist", title: "Final Checklist", status: "pending" },
    ]);
    const final = patch.paperwork.coned.customerTodos.find(
      (t) => t.kind === CONED_CUSTOMER_TODO_KINDS.FINAL_CHECKLIST
    );
    expect(final.status).toBe("pending");
  });
});

describe("conedTodoTapResult", () => {
  it("electric certificate → skill not built", () => {
    const r = conedTodoTapResult(
      { kind: "electric_certificate" },
      { serviceAddress: "1127 Lincoln", paperwork: { coned: { caseNumber: "MC-1" } } }
    );
    expect(r.action).toBe("skill_not_built");
    expect(r.message).toMatch(/not built/i);
  });

  it("final checklist blocked when prereqs open", () => {
    const r = conedTodoTapResult(
      { kind: "final_checklist", status: "blocked" },
      {
        paperwork: {
          coned: {
            customerTodos: [
              { kind: "application_for_service", status: "pending" },
              { kind: "electric_certificate", status: "pending" },
            ],
          },
        },
      }
    );
    expect(r.action).toBe("gated");
  });
});
