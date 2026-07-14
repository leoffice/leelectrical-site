// Existing invoice — unified view/send/edit (same layout as estimate DocSheet).
import React from "react";
import { DocSheet } from "./JobSheets.jsx";

export default function InvoiceDocSheet({ job, onClose, onEdit, onSync }) {
  return <DocSheet job={job} kind="invoice" onClose={onClose} onEdit={onEdit} onSync={onSync} />;
}