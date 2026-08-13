// @vitest-environment jsdom
// Send-time attachment picker (Levi 2026-08-12): every attachment on the
// record and its job — estimate, job info, invoice, letters — shows up with
// its own checkbox at send time, and only the CHECKED ones reach the email.
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import {
  attachmentOptionKey,
  defaultAttachmentKeys,
  listSendAttachmentOptions,
  selectedAttachmentRows,
} from "../src/lib/sendAttachmentOptions.js";
import { buildEmailAttachmentParts } from "../src/lib/emailAttachments.js";
import { LETTER_TYPES, createLetterDraft, letterAttachmentFromUpload } from "../src/lib/letterDraft.js";
import { setActiveTenantConfig } from "../src/lib/tenantBranding.js";
import DocEmailComposeSheet from "../src/components/DocEmailComposeSheet.jsx";
import SendDocConfirmSheet from "../src/components/SendDocConfirmSheet.jsx";

const leTenant = {
  profile: {
    companyName: "BLZ Electric Inc.",
    street: "383 Kingston Ave, Suite 297",
    cityStateZip: "Brooklyn, NY 11213",
    phone: "(718) 594-1850",
    email: "Office@LeElectrical.us",
    license: "Lic #11212",
  },
  branding: { companyName: "BLZ Electric Inc." },
  internal: true,
};

function approvedLetter() {
  const type = LETTER_TYPES.find((t) => t.id === "work_confirmation");
  const draft = createLetterDraft({
    type,
    job: { serviceAddress: "73-75 Grand Ave, Brooklyn", customer: "The Grand 73 LLC" },
    answers: {
      address: "73-75 Grand Ave, Brooklyn",
      insured: "The Grand 73 LLC",
      workDescription: "installed a new illuminated exit sign",
    },
  });
  draft.status = "approved";
  return draft;
}

describe("listSendAttachmentOptions", () => {
  it("merges session rows with job rows and dedupes by identity", () => {
    const shared = { id: "att-1", name: "Photo", url: "https://x/docs?key=chat-1-p.jpg", mime: "image/jpeg" };
    const opts = listSendAttachmentOptions({
      job: {
        attachments: [shared, { id: "att-2", name: "Old estimate file", url: "https://x/docs?key=chat-2-f.pdf" }],
      },
      docAttachments: [shared, { id: "att-3", name: "New file", url: "https://x/docs?key=chat-3-n.pdf" }],
    });
    expect(opts.map((o) => o.att.id).sort()).toEqual(["att-1", "att-2", "att-3"]);
    // Attachments saved earlier on the job (estimate / job info) are offered.
    expect(opts.find((o) => o.att.id === "att-2")?.source).toBe("job");
  });

  it("folds letter photo rows into the letter option (photos ride inside the letter PDF)", () => {
    const draft = approvedLetter();
    draft.photos = [{ id: "p1", name: "exit.jpg", url: "https://x/p1.jpg", mime: "image/jpeg" }];
    const letterRow = letterAttachmentFromUpload(draft, { url: "https://x/l.pdf", name: "Letter.pdf" });
    const photoRow = {
      id: "p1",
      name: "exit.jpg",
      url: "https://x/p1.jpg",
      mime: "image/jpeg",
      attachToEmail: true,
      letterId: draft.id,
    };
    const opts = listSendAttachmentOptions({
      job: {},
      docAttachments: [letterRow, photoRow],
      letterDrafts: [draft],
    });
    expect(opts).toHaveLength(1);
    expect(opts[0].isLetter).toBe(true);
    expect(opts[0].photoCount).toBe(1);
    expect(opts[0].defaultOn).toBe(true);
  });

  it("offers an approved draft with no attachment row (re-rendered at send)", () => {
    const draft = approvedLetter();
    const opts = listSendAttachmentOptions({ job: { letterDrafts: [draft] } });
    expect(opts).toHaveLength(1);
    expect(opts[0].key).toBe(String(draft.id));
    expect(opts[0].defaultOn).toBe(true);
  });

  it("letter still in draft status starts unchecked; opted-out file starts unchecked", () => {
    const draft = approvedLetter();
    draft.status = "draft";
    const off = { id: "att-9", name: "Do not send", url: "https://x/9.pdf", attachToEmail: false };
    const opts = listSendAttachmentOptions({ job: { letterDrafts: [draft], attachments: [off] } });
    expect(opts.every((o) => !o.defaultOn)).toBe(true);
    expect(defaultAttachmentKeys(opts)).toEqual([]);
  });

  it("no attachments anywhere → empty options (plain sends untouched)", () => {
    expect(listSendAttachmentOptions({ job: {} })).toEqual([]);
    expect(listSendAttachmentOptions({})).toEqual([]);
  });
});

describe("selection → email parts", () => {
  beforeEach(() => setActiveTenantConfig(leTenant));

  it("only the checked attachments reach the outgoing email payload", async () => {
    const draft = approvedLetter();
    const letterRow = letterAttachmentFromUpload(draft, { url: "https://x/l.pdf", name: "Letter.pdf" });
    const fileRow = { id: "att-5", name: "Spec sheet", url: "https://unreachable.invalid/s.pdf" };
    const opts = listSendAttachmentOptions({
      job: { attachments: [fileRow] },
      docAttachments: [letterRow],
      letterDrafts: [draft],
    });
    // Levi checks the letter, unchecks the spec sheet.
    const rows = selectedAttachmentRows(opts, [String(draft.id)]);
    expect(rows).toHaveLength(1);
    const parts = await buildEmailAttachmentParts({ attachments: rows, letterDrafts: [draft] });
    expect(parts).toHaveLength(1);
    expect(parts[0].filename).toBe("Letter.pdf");
    expect(Buffer.from(parts[0].contentB64, "base64").toString("latin1").startsWith("%PDF")).toBe(true);
    // Nothing checked → nothing extra rides along.
    expect(selectedAttachmentRows(opts, [])).toEqual([]);
    expect(await buildEmailAttachmentParts({ attachments: [], letterDrafts: [draft] })).toEqual([]);
  });

  it("checking a row overrides a stored attachToEmail:false", () => {
    const off = { id: "att-9", name: "File", url: "https://x/9.pdf", attachToEmail: false };
    const opts = listSendAttachmentOptions({ job: { attachments: [off] } });
    const rows = selectedAttachmentRows(opts, [attachmentOptionKey(off)]);
    expect(rows).toHaveLength(1);
    expect(rows[0].attachToEmail).toBe(true);
  });
});

describe("DocEmailComposeSheet picker", () => {
  beforeEach(() => setActiveTenantConfig(leTenant));

  function optionsFixture() {
    const draft = approvedLetter();
    const letterRow = letterAttachmentFromUpload(draft, { url: "https://x/l.pdf", name: "Letter.pdf" });
    const fileRow = { id: "att-5", name: "Spec sheet", url: "https://x/s.pdf" };
    return listSendAttachmentOptions({
      job: { attachments: [fileRow] },
      docAttachments: [letterRow],
      letterDrafts: [draft],
    });
  }

  it("lists each attachment with its own checkbox and sends only checked keys", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    const options = optionsFixture();
    render(
      <DocEmailComposeSheet
        kind="invoice"
        jobEmail="c@x.com"
        initialEmail="c@x.com"
        attachmentOptions={options}
        qboOn={false}
        onClose={() => {}}
        onSend={onSend}
      />
    );
    expect(screen.getByTestId("doc-attachment-picker")).toBeInTheDocument();
    // Fixed row: the document PDF itself is always included.
    expect(screen.getByTestId("doc-attachment-fixed")).toHaveTextContent(/always included/i);
    // Both options pre-checked (approved letter + opted-in file).
    expect(screen.getByTestId("doc-attachment-pick-box-1")).toBeChecked();
    expect(screen.getByTestId("doc-attachment-pick-box-2")).toBeChecked();
    // Uncheck the second (the spec sheet) — only the letter should send.
    await user.click(screen.getByTestId("doc-attachment-pick-box-2"));
    await user.click(screen.getByTestId("doc-send-local"));
    expect(onSend).toHaveBeenCalled();
    const sent = onSend.mock.calls[0][0];
    expect(sent.attachmentKeys).toEqual([options[0].key]);
    expect(sent.includeAttachments).toBe(true);
  });

  it("no options → no picker, send still works (records with no attachments)", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(
      <DocEmailComposeSheet
        kind="invoice"
        jobEmail="c@x.com"
        initialEmail="c@x.com"
        attachmentOptions={[]}
        qboOn={false}
        onClose={() => {}}
        onSend={onSend}
      />
    );
    expect(screen.queryByTestId("doc-attachment-picker")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("doc-send-local"));
    expect(onSend).toHaveBeenCalled();
    expect(onSend.mock.calls[0][0].attachmentKeys).toEqual([]);
    expect(onSend.mock.calls[0][0].includeAttachments).toBe(false);
  });
});

describe("SendDocConfirmSheet picker (resend path)", () => {
  beforeEach(() => setActiveTenantConfig(leTenant));

  it("lists the job's attachments and passes only checked rows on approve", async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();
    const draft = approvedLetter();
    const job = {
      id: "j1",
      email: "c@x.com",
      invoiceNo: "251900",
      customer: "The Grand 73 LLC",
      attachments: [
        letterAttachmentFromUpload(draft, { url: "https://x/l.pdf", name: "Letter.pdf" }),
        { id: "att-5", name: "Spec sheet", url: "https://x/s.pdf" },
      ],
      letterDrafts: [draft],
    };
    render(<SendDocConfirmSheet job={job} kind="invoice" onBack={() => {}} onApprove={onApprove} />);
    expect(screen.getByTestId("send-confirm-attachment-picker")).toBeInTheDocument();
    // Uncheck the spec sheet, approve.
    await user.click(screen.getByTestId("send-confirm-attachment-box-2"));
    await user.click(screen.getByTestId("send-confirm-approve"));
    expect(onApprove).toHaveBeenCalled();
    const model = onApprove.mock.calls[0][0];
    expect(Array.isArray(model.attachmentRows)).toBe(true);
    expect(model.attachmentRows).toHaveLength(1);
    expect(model.attachmentRows[0].letterId).toBe(draft.id);
  });

  it("job without attachments keeps the legacy model (no attachmentRows key)", async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();
    const job = { id: "j2", email: "c@x.com", invoiceNo: "251901", customer: "X" };
    render(<SendDocConfirmSheet job={job} kind="invoice" onBack={() => {}} onApprove={onApprove} />);
    expect(screen.queryByTestId("send-confirm-attachment-picker")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("send-confirm-approve"));
    expect(onApprove).toHaveBeenCalled();
    expect("attachmentRows" in onApprove.mock.calls[0][0]).toBe(false);
  });
});
