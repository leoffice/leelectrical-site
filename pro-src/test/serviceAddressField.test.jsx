// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import ServiceAddressField from "../src/components/ServiceAddressField.jsx";
import { render } from "@testing-library/react";

afterEach(() => {
  localStorage.clear();
});

describe("ServiceAddressField", () => {
  const jobs = [
    { id: "J-1", customer: "Acme", businessName: "Acme", serviceAddress: "10 Oak St", qboCustomerId: "99" },
    { id: "J-2", customer: "Acme", businessName: "Acme", serviceAddress: "22 Pine Rd", apartment: "2B", qboCustomerId: "99" },
  ];

  it("shows customer sites as chips and fills street + apartment on pick", async () => {
    const user = userEvent.setup();
    const state = { addr: "", apt: "" };
    function Harness() {
      const [addr, setAddr] = React.useState("");
      const [apt, setApt] = React.useState("");
      state.addr = addr;
      state.apt = apt;
      return (
        <ServiceAddressField
          job={{ customer: "Acme", qboCustomerId: "99" }}
          jobs={jobs}
          value={addr}
          onChange={setAddr}
          onApartmentChange={setApt}
          testId="svc"
        />
      );
    }
    render(<Harness />);

    expect(screen.getByTestId("svc-choices")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /22 Pine Rd/ }));
    expect(state.addr).toBe("22 Pine Rd");
    expect(state.apt).toBe("2B");
    expect(screen.getByTestId("svc")).toHaveValue("22 Pine Rd");
  });

  it("does not show chips when customer has no prior jobs", () => {
    render(
      <ServiceAddressField
        job={{ customer: "Brand New Co" }}
        jobs={jobs}
        value=""
        onChange={() => {}}
        testId="svc"
      />
    );
    expect(screen.queryByTestId("svc-choices")).toBeNull();
    expect(screen.getByLabelText("Service address")).toBeInTheDocument();
  });

  it("＋ New clears street and apartment", async () => {
    const user = userEvent.setup();
    const state = { addr: "22 Pine Rd", apt: "2B" };
    function Harness() {
      const [addr, setAddr] = React.useState("22 Pine Rd");
      const [apt, setApt] = React.useState("2B");
      state.addr = addr;
      state.apt = apt;
      return (
        <ServiceAddressField
          job={{ customer: "Acme", qboCustomerId: "99" }}
          jobs={jobs}
          value={addr}
          onChange={setAddr}
          apartment={apt}
          onApartmentChange={setApt}
          testId="svc"
        />
      );
    }
    render(<Harness />);
    expect(screen.getByTestId("svc-apartment")).toHaveValue("2B");
    await user.click(screen.getByTestId("svc-new"));
    expect(state.addr).toBe("");
    expect(state.apt).toBe("");
  });

  it("renders only one apartment field when apartment prop is controlled", () => {
    render(
      <ServiceAddressField
        job={{ customer: "Acme", qboCustomerId: "99" }}
        jobs={jobs}
        value="10 Oak St"
        onChange={() => {}}
        apartment="1A"
        onApartmentChange={() => {}}
        testId="svc"
      />
    );
    expect(screen.getAllByLabelText("Apartment")).toHaveLength(1);
    expect(screen.getByTestId("svc-apartment")).toHaveValue("1A");
  });
});