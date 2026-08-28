// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import DescriptionField from "../src/components/DescriptionField.jsx";
import PolishQuestionnaireSheet from "../src/components/PolishQuestionnaireSheet.jsx";
import { TRAILER_SOW_ROUGH, LABOR_ONLY_NOTE } from "../src/lib/workDescriptionPolish.js";

afterEach(() => {
  cleanup();
});

describe("PolishQuestionnaireSheet", () => {
  it("lists clarifying questions and can polish without answers", () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    render(
      <PolishQuestionnaireSheet
        roughText={TRAILER_SOW_ROUGH}
        styleKey="professional"
        context={{ jobTitle: "temporary sleeping trailers" }}
        onApply={onApply}
        onClose={onClose}
      />
    );
    expect(screen.getByTestId("polish-q-sheet")).toBeInTheDocument();
    expect(screen.getByTestId("polish-q-card-count_load")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("polish-q-without"));
    expect(onApply).toHaveBeenCalled();
    const text = onApply.mock.calls[0][0];
    expect(text).toContain("Electrical work — temporary sleeping trailers:");
    expect(text).toContain(LABOR_ONLY_NOTE);
    expect(onClose).toHaveBeenCalled();
  });

  it("applies answered clarifications into re-polish", () => {
    const onApply = vi.fn();
    render(
      <PolishQuestionnaireSheet
        roughText={TRAILER_SOW_ROUGH}
        styleKey="professional"
        context={{ jobTitle: "temporary sleeping trailers" }}
        onApply={onApply}
        onClose={() => {}}
      />
    );
    fireEvent.change(screen.getByTestId("polish-q-answer-count_load"), {
      target: { value: "8 trailers · 60 A each" },
    });
    fireEvent.click(screen.getByTestId("polish-q-apply"));
    expect(onApply).toHaveBeenCalled();
    const text = onApply.mock.calls[0][0];
    expect(text).toContain("8 trailers");
    expect(text).toContain("Electrical work — temporary sleeping trailers:");
  });

  it("can skip a question", () => {
    render(
      <PolishQuestionnaireSheet
        roughText={TRAILER_SOW_ROUGH}
        styleKey="professional"
        context={{ jobTitle: "temporary sleeping trailers" }}
        onApply={() => {}}
        onClose={() => {}}
      />
    );
    fireEvent.click(screen.getByTestId("polish-q-skip-count_load"));
    expect(screen.getByTestId("polish-q-skipped-count_load")).toHaveTextContent("Skipped");
    expect(screen.queryByTestId("polish-q-answer-count_load")).toBeNull();
  });
});

describe("DescriptionField polish → questionnaire", () => {
  it("opens clarifying questionnaire for Professional on trailer notes", () => {
    let text = TRAILER_SOW_ROUGH;
    const onChange = vi.fn((next) => {
      text = next;
    });
    render(
      <DescriptionField
        value={text}
        onChange={onChange}
        context={{ jobTitle: "temporary sleeping trailers" }}
      />
    );
    fireEvent.click(screen.getByTestId("description-field-polish-btn"));
    fireEvent.click(screen.getByTestId("description-field-polish-professional"));
    expect(screen.getByTestId("polish-q-sheet")).toBeInTheDocument();
    // Not applied until Apply / Polish without answers.
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("polish-q-without"));
    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls[0][0]).toContain("Electrical work — temporary sleeping trailers:");
  });

  it("still polishes Brief without opening the questionnaire", () => {
    let text = "panel swap and new circuits";
    const onChange = vi.fn((next) => {
      text = next;
    });
    render(<DescriptionField value={text} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("description-field-polish-btn"));
    fireEvent.click(screen.getByTestId("description-field-polish-brief"));
    expect(screen.queryByTestId("polish-q-sheet")).toBeNull();
    expect(onChange).toHaveBeenCalled();
  });
});
