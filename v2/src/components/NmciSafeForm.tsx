// NMCI Firepit blocks native submission of an HTML form (the submit event
// and any navigation it would start) and blocks implicit Enter submission
// when no explicit button is present.
//
// This wrapper is a div. Enter in a field clicks the explicit type="button"
// marked with the nmci submit data attribute. That click is the only action.

import React, { useRef } from "react";

interface NmciSafeFormProps {
  className?: string;
  children: React.ReactNode;
}

export function NmciSafeForm({ className, children }: NmciSafeFormProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (e.target as HTMLElement).tagName;
    // Textareas use Enter for newlines. Selects use it to pick an option.
    // A button's own Enter activation must not be clicked a second time.
    if (tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON") return;
    e.preventDefault();
    rootRef.current
      ?.querySelector<HTMLButtonElement>("button[data-nmci-submit]")
      ?.click();
  };

  return (
    <div ref={rootRef} className={className} onKeyDown={onKeyDown}>
      {children}
    </div>
  );
}
