// lib/navfit98/writeAccdb.ts
//
// Runs the Java sidecar (scripts/navfit98/navfit-writer.jar) to write NAVFIT
// report rows into a copy of the template .accdb and returns the finished
// file. Server-only — requires a JRE on the host; gate with
// isNavfitWriterAvailable().
// Spec: docs/specs/navfit98-field-mapping.md §0.

import { spawn } from "child_process";
import { mkdtemp, readFile, rm } from "fs/promises";
import os from "os";
import path from "path";

import type { IsNavfitWriterAvailable, WriteNavfitAccdb } from "./types";

const SIDECAR_TIMEOUT_MS = 30_000;

const javaBin = () => process.env.NAVFIT98_JAVA ?? "java";

function run(
  cmd: string,
  args: string[],
  stdin?: string,
): Promise<{
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { timeout: SIDECAR_TIMEOUT_MS });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d;
    });
    child.stderr.on("data", (d) => {
      stderr += d;
    });
    child.on("error", reject);
    child.on("close", (code, signal) => resolve({ code, signal, stdout, stderr }));
    // swallow EPIPE if the process dies before consuming stdin
    child.stdin.on("error", () => {});
    child.stdin.end(stdin ?? "");
  });
}

export const writeNavfitAccdb: WriteNavfitAccdb = async (reports) => {
  const sidecarDir = path.join(process.cwd(), "scripts", "navfit98");
  const templatePath =
    process.env.NAVFIT98_TEMPLATE_PATH ??
    path.join(sidecarDir, "template.accdb");
  const classpath = [
    path.join(sidecarDir, "navfit-writer.jar"),
    path.join(sidecarDir, "lib", "jackcess-4.0.5.jar"),
    path.join(sidecarDir, "lib", "commons-lang3.jar"),
    path.join(sidecarDir, "lib", "commons-logging.jar"),
    path.join(sidecarDir, "lib", "json.jar"),
  ].join(path.delimiter);

  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "navfit98-"));
  try {
    const outputPath = path.join(tmpDir, "export.accdb");
    // No folders array: rows carry Parent "a 1", the template's kept Root
    // folder (spec §0 — a dangling Parent hides the report silently).
    const payload = JSON.stringify({
      templatePath,
      outputPath,
      clearReports: true,
      reports,
    });

    const { code, signal, stdout, stderr } = await run(
      javaBin(),
      ["-cp", classpath, "NavfitWriter"],
      payload,
    );

    // Result is the last stdout line (library logging may precede it).
    let result: { ok: boolean; error?: string } | undefined;
    try {
      result = JSON.parse(stdout.trim().split("\n").pop() ?? "");
    } catch {
      // non-JSON stdout — reported below via exit code / stderr
    }

    if (code !== 0 || !result?.ok) {
      const reason =
        result?.error ??
        (signal
          ? `killed by ${signal} (${SIDECAR_TIMEOUT_MS / 1000}s timeout)`
          : `exit code ${code}`);
      const tail = stderr.trim().slice(-500);
      throw new Error(
        `NAVFIT writer failed: ${reason}${tail ? `\nstderr: ${tail}` : ""}`,
      );
    }

    return await readFile(outputPath);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
};

// Cached module-level: JRE presence doesn't change within a process.
let javaAvailable: Promise<boolean> | undefined;

export const isNavfitWriterAvailable: IsNavfitWriterAvailable = () => {
  if (!javaAvailable) {
    javaAvailable = run(javaBin(), ["-version"]).then(
      (r) => r.code === 0,
      () => false,
    );
  }
  return javaAvailable;
};
