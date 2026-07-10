// Sub-company toggle — expands parent-company picker for LLCs under a management company.
import React from "react";
import Toggle from "./Toggle.jsx";
import ParentCompanyPicker from "./ParentCompanyPicker.jsx";
import { Fld } from "./Sheet.jsx";

export default function SubCompanySection({
  on,
  onToggle,
  parentName,
  onParentNameChange,
  onParentPick,
  testId = "subcompany",
}) {
  return (
    <>
      <div className="flex items-center justify-between gap-3 mb-3" data-testid={`${testId}-toggle-row`}>
        <div>
          <p className="text-sm font-semibold text-slate-800">Sub company</p>
          <p className="text-xs text-slate-500">LLC or billing entity under a management company</p>
        </div>
        <Toggle small on={on} onChange={onToggle} label="Sub company" />
      </div>
      {on ? (
        <Fld label="Parent company" hint="Management company this entity bills under">
          <ParentCompanyPicker
            label="Parent company"
            testId={`${testId}-parent`}
            value={parentName}
            onChangeText={onParentNameChange}
            onPick={onParentPick}
            placeholder="Search parent company…"
          />
        </Fld>
      ) : null}
    </>
  );
}