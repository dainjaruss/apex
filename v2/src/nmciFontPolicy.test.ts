import { describe, expect, it } from "vitest";

// Firepit blocks the Google font hosts. The UI font has to ship inside the
// single-file bundle. This scans source, including CSS, not the rendered DOM.
const rawModules = import.meta.glob(
  ["./**/*.{ts,tsx,css}", "../index.html"],
  { query: "?raw", import: "default", eager: true },
);

describe("NMCI font policy", () => {
  it("does not request a Google font host", () => {
    const hits: string[] = [];
    for (const [rel, text] of Object.entries(rawModules)) {
      if (rel.includes(".test.")) continue;
      if (/fonts\.(googleapis|gstatic)\.com/.test(String(text))) hits.push(rel);
    }
    expect(hits).toEqual([]);
  });
});
