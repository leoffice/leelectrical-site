// @vitest-environment jsdom
import React from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import CustomerComposeSheet from "../src/components/CustomerComposeSheet.jsx";
import { StoreProvider } from "../src/state/store.jsx";
import { J1, mockServer } from "./helpers.jsx";

function renderSheet(node) {
  return render(<StoreProvider>{node}</StoreProvider>);
}

describe("CustomerComposeSheet", () => {
  it("email compose enqueues send_customer_email", async () => {
    const srv = mockServer();
    renderSheet(<CustomerComposeSheet job={J1} channel="email" onClose={() => {}} />);
    fireEvent.click(screen.getByTestId("compose-polish-btn"));
    fireEvent.click(screen.getByTestId("compose-mood-friendly"));
    fireEvent.click(screen.getByTestId("compose-send-btn"));
    await waitFor(() => expect(srv.enqueued("send_customer_email")).toHaveLength(1));
    const cmd = srv.enqueued("send_customer_email")[0];
    expect(cmd.lane).toBe("deterministic");
    expect(cmd.payload.email).toBe("p@x.com");
    expect(cmd.payload.message).toContain("Peretz");
  });

  it("sms compose enqueues send_sms judgment", async () => {
    const srv = mockServer();
    renderSheet(<CustomerComposeSheet job={J1} channel="sms" onClose={() => {}} />);
    fireEvent.change(screen.getByTestId("compose-sms-to"), { target: { value: "718-555-1111" } });
    fireEvent.click(screen.getByTestId("compose-send-btn"));
    await waitFor(() => expect(srv.enqueued("send_sms")).toHaveLength(1));
    expect(srv.enqueued("send_sms")[0].lane).toBe("judgment");
  });
});