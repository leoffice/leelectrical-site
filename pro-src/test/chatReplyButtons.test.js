import { describe, expect, it } from "vitest";
import { parseReplyButtons } from "../src/lib/chatReplyButtons.js";

describe("parseReplyButtons", () => {
  it("strips ---BUTTONS--- block", () => {
    const text =
      "Pick one:\n\n---BUTTONS---\nRecord $1,200 on #251808 | record_pay_251808\nOpen that job | open_251808\nSomething else | other";
    const { body, buttons } = parseReplyButtons(text);
    expect(body).toBe("Pick one:");
    expect(buttons).toHaveLength(3);
    expect(buttons[0]).toMatchObject({ label: "Record $1,200 on #251808", replyText: "Record $1,200 on #251808" });
    expect(buttons[1].label).toBe("Open that job");
  });

  it("parses A/B/C options line", () => {
    const text =
      'I read your photo.\nOptions: A) Record $2300 payment · B) Open #251808 — Bugsy · C) Ask Israel';
    const { body, buttons } = parseReplyButtons(text);
    expect(body).toBe("I read your photo.");
    expect(buttons).toHaveLength(3);
    expect(buttons[0]).toMatchObject({ letter: "A", replyText: "A" });
    expect(buttons[1].letter).toBe("B");
  });

  it("returns plain text when no buttons", () => {
    expect(parseReplyButtons("All set — payment staged.")).toEqual({
      body: "All set — payment staged.",
      buttons: [],
    });
  });
});