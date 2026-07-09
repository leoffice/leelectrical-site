// App-wide duplicate prompts — customer merge + invoice dedupe.
// Shown from any tab after the daily scan runs on jobs load.
import React from "react";
import MergePrompt from "./MergePrompt.jsx";
import InvoiceDedupPrompt from "./InvoiceDedupPrompt.jsx";

export default function DedupePrompts() {
  return (
    <>
      <MergePrompt />
      <InvoiceDedupPrompt />
    </>
  );
}