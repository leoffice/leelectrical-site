// App-wide duplicate prompts — customer merge + invoice dedupe.
// Shown from any tab after the daily scan runs on jobs load.
// Strong matches auto-reconcile silently before weak pairs are prompted.
import React from "react";
import CustomerAutoReconcile from "./CustomerAutoReconcile.jsx";
import MergePrompt from "./MergePrompt.jsx";
import InvoiceDedupPrompt from "./InvoiceDedupPrompt.jsx";

export default function DedupePrompts() {
  return (
    <>
      <CustomerAutoReconcile />
      <MergePrompt />
      <InvoiceDedupPrompt />
    </>
  );
}