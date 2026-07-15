// Location input with system-first + real-world address suggestions.
import React from "react";
import { Fld } from "./Sheet.jsx";
import AddressAutocompleteField from "./AddressAutocompleteField.jsx";

export default function LocationSuggestField({
  job,
  jobs,
  events,
  value,
  onChange,
  suggestAddresses,
  hint = "Service address",
  testId = "appt-location",
}) {
  return (
    <Fld label="Location" hint={hint}>
      <AddressAutocompleteField
        label="Location"
        value={value}
        onChange={onChange}
        jobs={jobs}
        events={events}
        suggestAddresses={suggestAddresses}
        testId={testId}
        ariaLabel="Location"
      />
    </Fld>
  );
}