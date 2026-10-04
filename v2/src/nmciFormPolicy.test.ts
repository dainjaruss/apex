import { describe, expect, it } from "vitest";

// Raw source, so the policy is checked against what Firepit will parse,
// not against the rendered DOM. Test files are excluded: they name the
// banned patterns on purpose.
const rawModules = import.meta.glob(
  ["./**/*.ts", "./**/*.tsx", "!./**/*.test.ts", "!./**/*.test.tsx"],
  { query: "?raw", import: "default", eager: true },
);

function sourceFiles(): Array<{ rel: string; text: string }> {
  return Object.entries(rawModules).map(([rel, text]) => ({
    rel,
    text: String(text),
  }));
}

function buttonOpenTags(source: string): string[] {
  const tags: string[] = [];
  let i = 0;
  while (i < source.length) {
    const idx = source.indexOf("<button", i);
    if (idx === -1) break;
    const prev = idx === 0 ? "" : source[idx - 1];
    if (prev && /[\w]/.test(prev)) {
      i = idx + 7;
      continue;
    }
    let j = idx + 7;
    let quote: string | null = null;
    let brace = 0;
    while (j < source.length) {
      const c = source[j];
      if (quote) {
        if (c === "\\") {
          j += 2;
          continue;
        }
        if (c === quote) quote = null;
        j += 1;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") {
        quote = c;
        j += 1;
        continue;
      }
      if (c === "{") brace += 1;
      else if (c === "}") brace = Math.max(0, brace - 1);
      else if (c === ">" && brace === 0) break;
      j += 1;
    }
    tags.push(source.slice(idx, j + 1));
    i = j + 1;
  }
  return tags;
}

describe("NMCI Firepit form policy", () => {
  const files = sourceFiles();

  it("finds the v2 source tree", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("never uses a native form, a submit button, or form.submit()", () => {
    const violations: string[] = [];
    for (const file of files) {
      const lines = file.text.split("\n");
      lines.forEach((line, n) => {
        if (/<form(\s|>|\/)/.test(line)) {
          violations.push(`${file.rel}:${n + 1} native form element`);
        }
        if (/type\s*=\s*["']submit["']/.test(line)) {
          violations.push(`${file.rel}:${n + 1} type=submit starts a native submission`);
        }
        if (/\.submit\s*\(|requestSubmit\s*\(/.test(line)) {
          violations.push(`${file.rel}:${n + 1} programmatic form submit`);
        }
        if (/onSubmit\s*=/.test(line)) {
          violations.push(`${file.rel}:${n + 1} onSubmit listens to native submission`);
        }
      });
    }
    expect(violations).toEqual([]);
  });

  it("gives every button an explicit type=button so it cannot implicit-submit", () => {
    const violations: string[] = [];
    for (const file of files) {
      for (const tag of buttonOpenTags(file.text)) {
        if (!/\stype\s*=\s*["']button["']/.test(tag)) {
          violations.push(`${file.rel}: ${tag.replace(/\s+/g, " ").slice(0, 140)}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("pairs every safe form with one explicit submit button", () => {
    const violations: string[] = [];
    for (const file of files) {
      const forms = file.text.match(/<NmciSafeForm\b/g)?.length ?? 0;
      const submits = file.text.match(/data-nmci-submit=""/g)?.length ?? 0;
      if (forms !== submits) {
        violations.push(
          `${file.rel}: ${forms} NmciSafeForm vs ${submits} data-nmci-submit`,
        );
      }
    }
    expect(violations).toEqual([]);
  });
});
