import { describe, expect, it } from "vitest";
import { sasRecordingForJob } from "../src/lib/sasJobRecording.js";

describe("sasJobRecording", () => {
  it("uses stored URL on job", () => {
    expect(sasRecordingForJob({ _sasRecordingUrl: "https://rec.example/a.mp3" }, [])).toBe(
      "https://rec.example/a.mp3"
    );
  });

  it("falls back to live SAS call list", () => {
    const calls = [{ id: "c1", data: { recording_url: "https://rec.example/b.mp3" } }];
    expect(sasRecordingForJob({ _sasCallId: "c1" }, calls)).toBe("https://rec.example/b.mp3");
  });

  it("returns empty when no link", () => {
    expect(sasRecordingForJob({ id: "J-1" }, [])).toBe("");
  });
});