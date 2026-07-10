// Change-order jobs — extra invoice or estimate at the same customer + address.
import { cloneJobAtAddressPatch } from "./customerHierarchy.js";

/** Patch for a new change-order job cloned from an existing one. */
export function changeOrderJobPatch(sourceJob, kind = "invoice") {
  const base = cloneJobAtAddressPatch(sourceJob);
  const label = kind === "estimate" ? "Change order estimate" : "Change order invoice";
  return {
    ...base,
    title: label,
    changeOrder: true,
    changeOrderKind: kind,
  };
}