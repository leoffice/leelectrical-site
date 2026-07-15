// Play answering-service call recording on jobs created from SAS leads.
import React from "react";
import { sasRecordingForJob } from "../lib/sasJobRecording.js";

export default function SasRecordingLink({ job, sasCalls }) {
  const url = sasRecordingForJob(job, sasCalls);
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand mt-2"
      data-testid="job-sas-recording"
      data-no-card-open
      onClick={(e) => e.stopPropagation()}
    >
      ▶ Play call recording
    </a>
  );
}