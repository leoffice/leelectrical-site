// Existing estimate — unified view/send/edit (same layout as invoice DocSheet).
import React from "react";
import { DocSheet } from "./JobSheets.jsx";

export default function EstimateDocSheet({ job, onClose, onConvert, onEdit }) {
  return <DocSheet job={job} kind="estimate" onClose={onClose} onConvert={onConvert} onEdit={onEdit} />;
}