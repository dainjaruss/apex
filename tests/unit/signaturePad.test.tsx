// tests/unit/signaturePad.test.tsx
//
// Unit tests for the SignaturePad component and signature data flow.
//

import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SignaturePad from "@/components/SignaturePad";

describe("SignaturePad Component", () => {
  const onSaveMock = vi.fn();
  const onClearMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render a "Tap to Sign" button when no existing signature', () => {
    render(
      <SignaturePad
        label="Rater Signature"
        blockNumber={42}
        onSave={onSaveMock}
        onClear={onClearMock}
      />,
    );

    expect(screen.getByText(/Tap to Sign/i)).toBeDefined();
    expect(screen.getByText(/Block 42: Rater Signature/i)).toBeDefined();
  });

  it('should show the signing pad when "Tap to Sign" is clicked', () => {
    render(
      <SignaturePad
        label="Rater Signature"
        blockNumber={42}
        onSave={onSaveMock}
        onClear={onClearMock}
      />,
    );

    fireEvent.click(screen.getByText(/Tap to Sign/i));

    // Should now show the canvas area, typed name input, consent checkbox, and buttons
    expect(screen.getByPlaceholderText(/LAST, FIRST MI/i)).toBeDefined();
    expect(screen.getByText(/I certify/i)).toBeDefined();
    expect(screen.getByText(/Apply Signature/i)).toBeDefined();
    expect(screen.getByText(/Cancel/i)).toBeDefined();
  });

  it("should disable Apply Signature when typed name is empty or consent unchecked", () => {
    render(
      <SignaturePad
        label="Rater Signature"
        blockNumber={42}
        onSave={onSaveMock}
        onClear={onClearMock}
      />,
    );

    fireEvent.click(screen.getByText(/Tap to Sign/i));

    const applyBtn = screen.getByText(/Apply Signature/i);
    expect(
      applyBtn.hasAttribute("disabled") ||
        (applyBtn as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("should call onSave when typed name filled and consent checked", async () => {
    render(
      <SignaturePad
        label="Rater Signature"
        blockNumber={42}
        onSave={onSaveMock}
        onClear={onClearMock}
      />,
    );

    fireEvent.click(screen.getByText(/Tap to Sign/i));

    // Fill typed name
    const nameInput = screen.getByPlaceholderText(/LAST, FIRST MI/i);
    fireEvent.change(nameInput, { target: { value: "SMITH, ALAN J" } });

    // Check consent
    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);

    // Click Apply
    const applyBtn = screen.getByText(/Apply Signature/i);
    fireEvent.click(applyBtn);

    expect(onSaveMock).toHaveBeenCalledTimes(1);
    expect(onSaveMock).toHaveBeenCalledWith(
      expect.objectContaining({
        typedName: "SMITH, ALAN J",
        dateSigned: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      }),
    );
  });

  it("should render existing signature preview when existingTypedName is provided", () => {
    render(
      <SignaturePad
        label="Rater Signature"
        blockNumber={42}
        existingTypedName="SMITH, ALAN J"
        onSave={onSaveMock}
        onClear={onClearMock}
      />,
    );

    expect(screen.getByText(/Signed: SMITH, ALAN J/i)).toBeDefined();
    expect(screen.getByText(/Clear Signature/i)).toBeDefined();
  });

  it("should call onClear when Clear Signature is clicked", () => {
    render(
      <SignaturePad
        label="Rater Signature"
        blockNumber={42}
        existingTypedName="SMITH, ALAN J"
        onSave={onSaveMock}
        onClear={onClearMock}
      />,
    );

    fireEvent.click(screen.getByText(/Clear Signature/i));
    expect(onClearMock).toHaveBeenCalledTimes(1);
  });

  it("should not show Clear Signature when disabled", () => {
    render(
      <SignaturePad
        label="Rater Signature"
        blockNumber={42}
        existingTypedName="SMITH, ALAN J"
        disabled={true}
        onSave={onSaveMock}
        onClear={onClearMock}
      />,
    );

    expect(screen.getByText(/Signed: SMITH, ALAN J/i)).toBeDefined();
    expect(screen.queryByText(/Clear Signature/i)).toBeNull();
  });
});
