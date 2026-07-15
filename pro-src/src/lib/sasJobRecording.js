// Recording URL for a job created from an SAS answering-service call.
import { callRecording } from "./sas.js";

export function sasRecordingForJob(job, sasCalls) {
  const stored = job?._sasRecordingUrl || job?.sasRecordingUrl || "";
  if (stored && /^https?:\/\//i.test(String(stored))) return String(stored).trim();
  const callId = job?._sasCallId || job?.sasCallId || "";
  if (!callId) return "";
  const call = (sasCalls || []).find((c) => c && String(c.id) === String(callId));
  return call ? callRecording(call) : "";
}