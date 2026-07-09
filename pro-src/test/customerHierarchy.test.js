// Unit — parent/sub customer hierarchy + service-address job grouping.
import { describe, expect, it } from "vitest";
import {
  buildCustomerBoardGroups,
  cloneJobAtAddressPatch,
  directJobsForParent,
  hasParentCustomer,
  jobsAtSameAddress,
  parentBoardKey,
  parentCustomerPatch,
  sameAddressGroup,
  serviceAddressKey,
  subsForParentQboId,
  subsUnderParent,
} from "../src/lib/customerHierarchy.js";
import { jobsForCustomerKey } from "../src/lib/customers.js";

const parentJob = (id, sub, parentId = "100") => ({
  id: String(id),
  customer: sub,
  businessName: sub,
  qboCustomerId: String(200 + Number(id)),
  parentQboCustomerId: parentId,
  parentCustomerName: "Mgmt Co",
  serviceAddress: "123 Main St",
  amount: "500",
});

describe("parentBoardKey", () => {
  it("uses qbo parent id when present", () => {
    expect(parentBoardKey({ parentQboCustomerId: "99", parentCustomerName: "X" })).toBe("p:q:99");
  });
  it("falls back to normalized parent name", () => {
    expect(parentBoardKey({ parentCustomerName: "Mgmt Co." })).toBe("p:c:mgmt co");
  });
});

describe("hasParentCustomer", () => {
  it("true when parent fields set", () => {
    expect(hasParentCustomer({ parentQboCustomerId: "1" })).toBe(true);
    expect(hasParentCustomer({ parentCustomerName: "Parent" })).toBe(true);
    expect(hasParentCustomer({ customer: "solo" })).toBe(false);
  });
});

describe("service address grouping", () => {
  const jobs = [
    { id: "a", customer: "Bob", qboCustomerId: "1", serviceAddress: "10 Oak Ave", amount: "100" },
    { id: "b", customer: "Bob", qboCustomerId: "1", serviceAddress: "10 Oak Ave", amount: "200" },
    { id: "c", customer: "Bob", qboCustomerId: "1", serviceAddress: "20 Pine Rd", amount: "300" },
  ];

  it("groups jobs at same address for same customer", () => {
    expect(jobsAtSameAddress(jobs, jobs[0]).map((j) => j.id)).toEqual(["a", "b"]);
    expect(sameAddressGroup(jobs[0], jobs[1])).toBe(true);
    expect(sameAddressGroup(jobs[0], jobs[2])).toBe(false);
  });

  it("normalizes address keys", () => {
    expect(serviceAddressKey({ serviceAddress: "10 Oak Ave., ", apartment: "2B" })).toContain("10 oak ave");
  });
});

describe("buildCustomerBoardGroups", () => {
  it("rolls parent balance across subs", () => {
    const jobs = [parentJob("1", "LLC A"), parentJob("2", "LLC B"), { id: "3", customer: "Solo", amount: "100" }];
    const board = buildCustomerBoardGroups(jobs);
    const parent = board.find((r) => r.kind === "parent");
    const solo = board.find((r) => r.kind === "standalone");
    expect(parent).toBeTruthy();
    expect(parent.subs.length).toBe(2);
    expect(parent.summary.jobCount).toBe(2);
    expect(solo).toBeTruthy();
    expect(solo.name).toBe("Solo");
  });
});

describe("jobsForCustomerKey parent routes", () => {
  it("p:q collects all subs", () => {
    const jobs = [parentJob("1", "LLC A"), parentJob("2", "LLC B")];
    expect(jobsForCustomerKey(jobs, "p:q:100")).toHaveLength(2);
  });

  it("p:q includes jobs billed directly to the parent", () => {
    const jobs = [
      parentJob("1", "LLC A"),
      { id: "9", customer: "Mgmt Co", businessName: "Mgmt Co", qboCustomerId: "100", amount: "300" },
    ];
    expect(jobsForCustomerKey(jobs, "p:q:100")).toHaveLength(2);
  });
});

describe("directJobsForParent", () => {
  it("finds standalone jobs for the parent qbo id", () => {
    const jobs = [
      parentJob("1", "LLC A"),
      { id: "9", customer: "Mgmt Co", qboCustomerId: "100", amount: "100" },
      { id: "10", customer: "Other", qboCustomerId: "50", amount: "50" },
    ];
    expect(directJobsForParent(jobs, "p:q:100").map((j) => j.id)).toEqual(["9"]);
  });
});

describe("subsForParentQboId", () => {
  it("returns sub rows", () => {
    const jobs = [parentJob("1", "LLC A"), parentJob("2", "LLC B")];
    const subs = subsForParentQboId(jobs, "100");
    expect(subs).toHaveLength(2);
    expect(subsUnderParent(jobs, "p:q:100")).toHaveLength(2);
  });
});

describe("cloneJobAtAddressPatch", () => {
  it("copies customer + address, clears invoice fields", () => {
    const p = cloneJobAtAddressPatch({
      businessName: "LLC",
      customer: "LLC",
      qboCustomerId: "5",
      parentQboCustomerId: "1",
      serviceAddress: "9 Elm",
      invoiceNo: "99",
      title: "Old",
    });
    expect(p.qboCustomerId).toBe("5");
    expect(p.parentQboCustomerId).toBe("1");
    expect(p.serviceAddress).toBe("9 Elm");
    expect(p.invoiceNo).toBe("");
    expect(p.title).toBe("");
  });
});

describe("parentCustomerPatch", () => {
  it("maps parent pick", () => {
    expect(parentCustomerPatch({ id: "42", name: "Parent LLC" })).toEqual({
      parentCustomerName: "Parent LLC",
      parentQboCustomerId: "42",
    });
  });
});