import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NmciSafeForm } from "./NmciSafeForm";

function Harness({ onSave }: { onSave: () => void }) {
  return (
    <NmciSafeForm>
      <label>
        Name
        <input aria-label="Name" />
      </label>
      <label>
        Notes
        <textarea aria-label="Notes" />
      </label>
      <label>
        Kind
        <select aria-label="Kind">
          <option>EVAL</option>
        </select>
      </label>
      <button type="button" data-nmci-submit="" onClick={onSave}>
        Save record
      </button>
    </NmciSafeForm>
  );
}

describe("NmciSafeForm", () => {
  it("is not a form and runs only from the explicit button", () => {
    const onSave = vi.fn();
    const { container } = render(<Harness onSave={onSave} />);

    expect(container.querySelector("form")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save record" }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("sends Enter in a field to the explicit button instead of a native submit", () => {
    const onSave = vi.fn();
    render(<Harness onSave={onSave} />);

    fireEvent.keyDown(screen.getByLabelText("Name"), { key: "Enter" });
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("does not treat Enter in a textarea, select, or the button as a submit", () => {
    const onSave = vi.fn();
    render(<Harness onSave={onSave} />);

    fireEvent.keyDown(screen.getByLabelText("Notes"), { key: "Enter" });
    fireEvent.keyDown(screen.getByLabelText("Kind"), { key: "Enter" });
    fireEvent.keyDown(screen.getByRole("button", { name: "Save record" }), {
      key: "Enter",
    });
    expect(onSave).not.toHaveBeenCalled();
  });
});
