import { describe, it, expect, vi } from "vitest";
import {
  REQUEST_TYPES,
  REQUEST_TYPE_LABELS,
  PORTAL_REQUEST_TYPES,
  AUTO_HANDLED,
  SKIP_OPTIONAL_KEYS,
  toPlainAscii,
  questionnaireSteps,
  portalWizardStepCount,
  isFullBranch,
  normalizeRequestType,
  seedCreateCaseAnswers,
  seedScopeOfWorkFromJob,
  missingCreateCaseFields,
  createCaseReady,
  buildCreateCasePayload,
  sumLoadKw,
  loadItemKw,
  resolveLoadEntryMode,
  HP_TO_KW,
  DEFAULT_LOAD_ITEMS,
  LOAD_CATALOG,
  makeLoadItemFromCatalog,
  buildLoadLearningEntry,
  appendLoadLearning,
  suggestLoadItemsFromLearning,
  recordLoadLearning,
  readGlobalLoadLearning,
  mergeLoadLearningHistories,
  clearGlobalLoadLearning,
} from "../src/lib/agencyForms/createCaseQuestionnaire.js";
import { queueConedCreateCase, CONED_CREATE_CASE_CMD } from "../src/lib/agencyForms/createCaseExecution.js";
import {
  resolveFormAForUpload,
  buildUploadToCasePayload,
  queueConedUploadDocument,
  DOCUMENT_TYPE,
  CONED_UPLOAD_DOCUMENT_CMD,
} from "../src/lib/agencyForms/uploadToCase.js";

const completeAnswers = {
  requestType: REQUEST_TYPES.NO_ADD_LOAD,
  serviceAddress: "555 Kingston Avenue",
  houseNumber: "555",
  streetName: "Kingston Avenue",
  city: "Brooklyn",
  state: "NY",
  zip: "11203",
  borough: "Brooklyn",
  bin: "1234567",
  buildingType: "Residential",
  is1to3Family: true,
  ownerFirst: "Test",
  ownerLast: "Two",
  ownerPhone: "7185551212",
  ownerEmail: "owner@example.com",
  servicePanelAmps: 100,
  phase: "Single phase",
  useExistingService: true,
  facilityServicedBy: "Underground",
  changePoe: false,
};

describe("toPlainAscii", () => {
  it("strips em-dashes and fancy quotes", () => {
    expect(toPlainAscii("555 Kingston — PLP")).toBe("555 Kingston - PLP");
    expect(toPlainAscii("“quoted”")).toBe('"quoted"');
  });
});

describe("request-type branches (S23)", () => {
  it("normalizes labels to branch ids", () => {
    expect(normalizeRequestType("add_load")).toBe(REQUEST_TYPES.ADD_LOAD);
    expect(normalizeRequestType("No Additional Load")).toBe(REQUEST_TYPES.NO_ADD_LOAD);
    expect(normalizeRequestType("Performing Work on Customer Equipment - No Additional Load")).toBe(
      REQUEST_TYPES.NO_ADD_LOAD
    );
  });

  it("short branch = 5 portal steps, no meters/load questionnaire steps", () => {
    expect(isFullBranch(REQUEST_TYPES.NO_ADD_LOAD)).toBe(false);
    expect(portalWizardStepCount(REQUEST_TYPES.NO_ADD_LOAD)).toBe(5);
    const ids = questionnaireSteps(REQUEST_TYPES.NO_ADD_LOAD).map((s) => s.id);
    expect(ids).not.toContain("meters");
    expect(ids).not.toContain("load");
    expect(ids).toContain("review");
    expect(ids.length).toBe(5); // type+property+owner+service+review
  });

  it("full branch = 6 portal steps, includes meters+load", () => {
    expect(isFullBranch(REQUEST_TYPES.ADD_LOAD)).toBe(true);
    expect(portalWizardStepCount(REQUEST_TYPES.ADD_LOAD)).toBe(6);
    const ids = questionnaireSteps(REQUEST_TYPES.ADD_LOAD).map((s) => s.id);
    expect(ids).toContain("meters");
    expect(ids).toContain("load");
    expect(ids.length).toBe(7); // +meters +load
  });

  it("payload omits load section on short branch and includes on full", () => {
    const short = buildCreateCasePayload(completeAnswers, { id: "j1" });
    expect(short.branch).toBe("B_short");
    expect(short.autoSubmit).toBe(false);
    expect(short.stopAt).toBe("review");
    expect(short.loadItems).toBeUndefined();
    expect(short.meters).toBeUndefined();
    expect(short.step1Extras.heatingElectrification).toBeNull();
    expect(short.requestTypePortal).toBe(REQUEST_TYPE_LABELS[REQUEST_TYPES.NO_ADD_LOAD]);

    const fullAns = {
      ...completeAnswers,
      requestType: REQUEST_TYPES.ADD_LOAD,
      meters: [
        { name: "Apartment 1", unitType: "Apartment" },
        { name: "PLP", unitType: "PLP" },
      ],
      loadItems: DEFAULT_LOAD_ITEMS,
      numberOfNewMeters: 2,
      meterCapacityIncrease: false,
    };
    const full = buildCreateCasePayload(fullAns, { id: "j1" });
    expect(full.branch).toBe("A_full");
    expect(full.portalWizardSteps).toBe(6);
    expect(full.meters.length).toBe(2);
    expect(full.loadItems.length).toBe(DEFAULT_LOAD_ITEMS.length);
    expect(full.step1Extras.heatingElectrification).toBe("No");
    expect(full.project.meterCapacityIncrease).toBe(false);
    expect(full.service.requiredTotalKw).toBe(sumLoadKw(DEFAULT_LOAD_ITEMS));
  });
});

describe("createCaseReady / missing fields", () => {
  it("requires BIN and owner contact", () => {
    const miss = missingCreateCaseFields("property", { ...completeAnswers, bin: "" });
    expect(miss.some((m) => m.key === "bin")).toBe(true);
    expect(createCaseReady(completeAnswers)).toBe(true);
    expect(createCaseReady({ ...completeAnswers, ownerEmail: "nope" })).toBe(false);
  });

  it("full branch requires meters", () => {
    const a = {
      ...completeAnswers,
      requestType: REQUEST_TYPES.ADD_LOAD,
      meters: [],
      loadItems: DEFAULT_LOAD_ITEMS,
    };
    expect(missingCreateCaseFields("meters", a).length).toBeGreaterThan(0);
  });
});

describe("seedCreateCaseAnswers", () => {
  it("prefills from job", () => {
    const a = seedCreateCaseAnswers({
      serviceAddress: "1127 Lincoln Place",
      customer: "Izzy Ben",
      email: "izzy@example.com",
      phone: "7185559999",
    });
    expect(a.serviceAddress).toContain("Lincoln");
    expect(a.ownerFirst).toBe("Izzy");
    expect(a.ownerEmail).toBe("izzy@example.com");
  });

  it("uses personName for owner, not company trade name", () => {
    const a = seedCreateCaseAnswers({
      serviceAddress: "1349 President St, Brooklyn NY 11213",
      customer: "Goodness and kindness",
      businessName: "Goodness and kindness",
      personName: "Yitzchok Dovid Rubashkin",
      email: "Goodnessandkindnessinc@gmail.com",
      phone: "9177552477",
    });
    expect(a.ownerFirst).toBe("Yitzchok Dovid");
    expect(a.ownerLast).toBe("Rubashkin");
    expect(a.ownerEmail).toMatch(/goodness/i);
  });

  it("does not treat company label as owner first/last", () => {
    const a = seedCreateCaseAnswers({
      serviceAddress: "1349 President St",
      customer: "Goodness and kindness",
      businessName: "Goodness and kindness",
      personName: "",
      email: "x@y.com",
      phone: "9177552477",
    });
    expect(a.ownerFirst).toBe("");
    expect(a.ownerLast).toBe("");
  });
});

describe("load item entry modes (Levi 2026-08-02)", () => {
  it("lighting uses total kW only", () => {
    const light = { name: "Lighting", entryMode: "totalKw", totalKw: 5, phase: "Single" };
    expect(resolveLoadEntryMode(light)).toBe("totalKw");
    expect(loadItemKw(light)).toBe(5);
    expect(sumLoadKw([light])).toBe(5);
  });

  it("other devices = qty × kW each", () => {
    const stove = { name: "Electric Stoves", entryMode: "qtyKw", qty: 2, kwEach: 3, phase: "Single" };
    expect(loadItemKw(stove)).toBe(6);
  });

  it("AC accepts HP and converts to kW", () => {
    const ac = {
      name: "Space Cooling / Central AC (cooling-only)",
      entryMode: "hp",
      unit: "hp",
      qty: 2,
      hpEach: 1,
      phase: "Single",
    };
    expect(resolveLoadEntryMode(ac)).toBe("hp");
    expect(loadItemKw(ac)).toBeCloseTo(2 * HP_TO_KW, 5);
  });

  it("payload includes entryMode + lineKw for host fill", () => {
    const fullAns = {
      ...completeAnswers,
      requestType: REQUEST_TYPES.ADD_LOAD,
      meters: [{ name: "Apartment 1", unitType: "Apartment" }],
      loadItems: [
        { name: "Lighting", entryMode: "totalKw", totalKw: 4, phase: "Single" },
        { name: "Kitchen Equipment", entryMode: "qtyKw", qty: 2, kwEach: 1, phase: "Single" },
      ],
      numberOfNewMeters: 1,
    };
    const full = buildCreateCasePayload(fullAns, { id: "j1" });
    const lighting = full.loadItems.find((x) => x.name === "Lighting");
    expect(lighting.entryMode).toBe("totalKw");
    expect(lighting.totalKw).toBe(4);
    expect(lighting.lineKw).toBe(4);
    expect(full.service.requiredTotalKw).toBe(6);
  });

  it("sumLoadKw falls back to lineKw-only payload rows", () => {
    expect(
      sumLoadKw([
        { name: "Lighting", entryMode: "totalKw", lineKw: 4 },
        { name: "Stoves", entryMode: "qtyKw", lineKw: 6 },
      ])
    ).toBe(10);
    expect(loadItemKw({ lineKw: 3.5 })).toBe(3.5);
  });

  it("payload re-parses house/street from edited serviceAddress", () => {
    const p = buildCreateCasePayload(
      {
        ...completeAnswers,
        serviceAddress: "1349 President St, Brooklyn NY 11213",
        houseNumber: "555", // stale
        streetName: "Kingston Avenue", // stale
      },
      { id: "j1" }
    );
    expect(p.property.houseNumber).toBe("1349");
    expect(p.property.streetName.toLowerCase()).toContain("president");
    expect(p.property.streetName.toLowerCase()).not.toMatch(/brooklyn/);
  });

  it("short branch still carries basic meter project fields", () => {
    const short = buildCreateCasePayload(
      {
        ...completeAnswers,
        numberOfNewMeters: 3,
        meterCapacityIncrease: false,
        metersRelocatedOutdoors: false,
      },
      { id: "j1" }
    );
    expect(short.branch).toBe("B_short");
    expect(short.project.numberOfNewMeters).toBe(3);
    expect(short.project.meterCapacityIncrease).toBe(false);
    expect(short.loadItems).toBeUndefined();
  });
});

describe("Levi create-case defaults (RTVI + skip optional)", () => {
  it("AUTO_HANDLED locks RTVI Yes and skipOptional", () => {
    expect(AUTO_HANDLED.rtvi).toBe("Yes");
    expect(AUTO_HANDLED.skipOptional).toBe(true);
    expect(AUTO_HANDLED.fillOptionalContractorFields).toBe(false);
    expect(AUTO_HANDLED.fillOptionalCustomerCompany).toBe(false);
    expect(AUTO_HANDLED.contractor).toMatch(/Levi|BLZ/i);
    expect(SKIP_OPTIONAL_KEYS).toContain("companyOptional");
    expect(SKIP_OPTIONAL_KEYS).toContain("block");
  });

  it("payload fillRules + contractor required-only; never companyOptional", () => {
    const p = buildCreateCasePayload(
      {
        ...completeAnswers,
        companyOptional: "Goodness and kindness",
        block: "1234",
        lot: "56",
        nearestCrossStreet: "Kingston",
      },
      { id: "j1" }
    );
    expect(p.autoHandled.rtvi).toBe("Yes");
    expect(p.autoHandled.skipOptional).toBe(true);
    expect(p.fillRules.rtvi).toBe("Yes");
    expect(p.fillRules.skipOptional).toBe(true);
    expect(p.fillRules.skipOptionalContractor).toBe(true);
    expect(p.fillRules.skipOptionalCustomerCompany).toBe(true);
    expect(p.owner.companyOptional).toBe("");
    expect(p.property.block).toBe("");
    expect(p.property.lot).toBe("");
    expect(p.contractor.name).toMatch(/Levi|BLZ/i);
    expect(p.contractor.fillOptional).toBe(false);
    expect(p.contractor.companyOptional).toBe("");
  });

  it("sanitizeAnswers strips optional company even if provided", () => {
    const a = seedCreateCaseAnswers(
      { serviceAddress: "1349 President St", personName: "Shalom Rubashkin", phone: "9177552477", email: "a@b.com" },
      {
        answers: {
          ...completeAnswers,
          companyOptional: "Goodness and kindness",
          ownerCompany: "Should blank",
          block: "999",
        },
      }
    );
    expect(a.companyOptional).toBe("");
    expect(a.ownerCompany).toBe("");
    expect(a.block).toBe("");
    expect(a.rtvi).toBe(true);
    expect(a.skipOptional).toBe(true);
  });
});

describe("load catalog + learning (Levi 2026-08-03)", () => {
  it("catalog includes Levi's common equipment", () => {
    const ids = LOAD_CATALOG.map((c) => c.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "lighting",
        "computers",
        "electric_stoves",
        "kitchen_appliances",
        "freezers",
        "ev_unit",
        "ev_charger",
        "motors",
      ])
    );
    expect(PORTAL_REQUEST_TYPES).toContain("Add Load to Existing Service");
    expect(PORTAL_REQUEST_TYPES).toContain(
      "Performing Work on Customer Equipment - No Additional Load"
    );
  });

  it("makeLoadItemFromCatalog sets correct entry modes", () => {
    const light = makeLoadItemFromCatalog("lighting");
    expect(light.entryMode).toBe("totalKw");
    expect(light.totalKw).toBe(2);
    const stove = makeLoadItemFromCatalog("electric_stoves");
    expect(stove.entryMode).toBe("qtyKw");
    expect(loadItemKw(stove)).toBe(6);
    const motor = makeLoadItemFromCatalog("motors");
    expect(motor.entryMode).toBe("hp");
  });

  it("learning averages prior fills for next prefill", () => {
    const a1 = {
      buildingType: "Residential",
      totalUnits: 2,
      is1to3Family: true,
      loadItems: [
        { name: "Lighting", entryMode: "totalKw", totalKw: 4, phase: "Single" },
        { name: "Electric Stoves", entryMode: "qtyKw", qty: 2, kwEach: 3, phase: "Single" },
      ],
    };
    const e1 = buildLoadLearningEntry(a1.loadItems, a1, { jobId: "j1" });
    const a2 = {
      ...a1,
      loadItems: [
        { name: "Lighting", entryMode: "totalKw", totalKw: 6, phase: "Single" },
        { name: "Electric Stoves", entryMode: "qtyKw", qty: 2, kwEach: 5, phase: "Single" },
      ],
    };
    const e2 = buildLoadLearningEntry(a2.loadItems, a2, { jobId: "j2" });
    const hist = appendLoadLearning(appendLoadLearning([], e1), e2);
    const suggested = suggestLoadItemsFromLearning(hist, {
      buildingType: "Residential",
      totalUnits: 2,
      is1to3Family: true,
    });
    expect(suggested).toBeTruthy();
    const light = suggested.find((x) => /light/i.test(x.name));
    expect(light.totalKw).toBe(5); // avg 4 and 6
    const stove = suggested.find((x) => /stove/i.test(x.name));
    expect(stove.kwEach).toBe(4); // avg 3 and 5
  });

  it("seedScopeOfWorkFromJob uses estimate lines (skips placeholder)", () => {
    const scope = seedScopeOfWorkFromJob({
      estimateLines: [
        {
          itemName: "Service Upgrade:3 Meters",
          description: "Estimate placeholder — replace with actual scope (restored after missing doc).",
        },
        { itemName: "Service Upgrade:3 Meters", description: "3 meter upgrade" },
      ],
    });
    expect(scope).toMatch(/3 meter upgrade/i);
    expect(scope).not.toMatch(/placeholder/i);
  });

  it("seedCreateCaseAnswers uses load history when present", () => {
    const hist = [
      buildLoadLearningEntry(
        [
          {
            name: "Freezers",
            catalogId: "freezers",
            entryMode: "qtyKw",
            qty: 3,
            kwEach: 2,
            phase: "Single",
          },
        ],
        { buildingType: "Residential", totalUnits: 2, is1to3Family: true },
        { jobId: "prior" }
      ),
    ];
    const a = seedCreateCaseAnswers(
      { serviceAddress: "100 Test St", personName: "Shalom Rubashkin" },
      null,
      { loadHistory: hist, skipGlobalLearning: true }
    );
    expect(a.ownerFirst).toBe("Shalom");
    expect(a.ownerLast).toBe("Rubashkin");
    expect(a._loadPrefillSource).toBe("learning");
    expect(a.loadItems.some((x) => /freezer/i.test(x.name))).toBe(true);
  });

  it("recordLoadLearning writes device-global bag for next job", () => {
    clearGlobalLoadLearning();
    const entry = buildLoadLearningEntry(
      [{ name: "Lighting", entryMode: "totalKw", totalKw: 3, phase: "Single" }],
      { buildingType: "Residential", totalUnits: 2, is1to3Family: true },
      { jobId: "j-global" }
    );
    recordLoadLearning([], entry);
    const global = readGlobalLoadLearning();
    expect(global.length).toBeGreaterThanOrEqual(1);
    expect(global[global.length - 1].items[0].name).toMatch(/light/i);
    const merged = mergeLoadLearningHistories([], global);
    expect(merged.length).toBeGreaterThanOrEqual(1);
    clearGlobalLoadLearning();
  });
});

describe("queueConedCreateCase", () => {
  it("queues coned_create_case with stopAt review", async () => {
    const enqueued = [];
    const enqueue = vi.fn(async (type, jobId, payload) => {
      enqueued.push({ type, jobId, payload });
    });
    const patches = [];
    const r = await queueConedCreateCase({
      answers: completeAnswers,
      job: { id: "test2" },
      enqueue,
      onSave: (p) => patches.push(p),
    });
    expect(r.ok).toBe(true);
    expect(r.queued).toBe(true);
    expect(enqueue).toHaveBeenCalled();
    expect(enqueued[0].type).toBe(CONED_CREATE_CASE_CMD);
    expect(enqueued[0].payload.stopAt).toBe("review");
    expect(enqueued[0].payload.autoSubmit).toBe(false);
    expect(patches[0].paperwork.coned.createCase).toBeTruthy();
  });

  it("fails closed without enqueue", async () => {
    const r = await queueConedCreateCase({
      answers: completeAnswers,
      job: { id: "test2" },
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/enqueue_not_wired/);
  });
});

describe("upload-to-case (S24)", () => {
  const jobWithFile = {
    id: "test2",
    serviceAddress: "555 Kingston Avenue",
    customer: "Test 2",
    paperwork: {
      coned: {
        caseNumber: "MC-941412",
        completedFiles: [
          {
            name: "555 Kingston Avenue - PLP - Test 2.pdf",
            meterLabel: "PLP",
            docKey: "coned-x",
          },
        ],
      },
    },
  };

  it("resolves Form A from completedFiles + Drive folder name", () => {
    const r = resolveFormAForUpload({ job: jobWithFile, meterLabel: "PLP" });
    expect(r.filename).toBe("555 Kingston Avenue - PLP - Test 2.pdf");
    expect(r.dedicatedFolder).toBe("BLZ Electric Inc/Con Edison Applications");
    expect(r.documentType).toBe(DOCUMENT_TYPE);
  });

  it("buildUpload payload includes Application for Service + no auto-submit", () => {
    const p = buildUploadToCasePayload({ job: jobWithFile });
    expect(p.caseNumber).toBe("MC-941412");
    expect(p.documentType).toBe("Application for Service");
    expect(p.autoSubmit).toBe(false);
    expect(p.skill).toBe("coned-upload-document");
  });

  it("queue requires case number", async () => {
    const r = await queueConedUploadDocument({
      job: { ...jobWithFile, paperwork: { coned: { completedFiles: jobWithFile.paperwork.coned.completedFiles } } },
      enqueue: vi.fn(),
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/missing_case_number/);
  });

  it("queues upload command when case + file present", async () => {
    const enqueue = vi.fn(async () => {});
    const r = await queueConedUploadDocument({
      job: jobWithFile,
      enqueue,
    });
    expect(r.ok).toBe(true);
    expect(enqueue.mock.calls[0][0]).toBe(CONED_UPLOAD_DOCUMENT_CMD);
    expect(enqueue.mock.calls[0][2].filename).toContain("Kingston");
  });
});
