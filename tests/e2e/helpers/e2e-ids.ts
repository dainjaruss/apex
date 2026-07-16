import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

export type E2ERole =
  "sailor" | "rater" | "seniorRater" | "reportingSenior" | "admin";

export interface E2EIds {
  users: Record<E2ERole, string>;
  evals: {
    routing: string;
    recycle: string;
    chiefEval?: string;
    fitrep?: string;
  };
  password: string;
  seededAt: string;
}

const ROLE_EMAIL: Record<E2ERole, string> = {
  sailor: "sailor@franklyn.dev",
  rater: "rater@franklyn.dev",
  seniorRater: "seniorrater@franklyn.dev",
  reportingSenior: "reportingsenior@franklyn.dev",
  admin: "admin@franklyn.dev",
};

export function loadE2EIds(): E2EIds {
  const path = resolve(process.cwd(), "tests/fixtures/e2e-ids.json");
  if (!existsSync(path)) {
    throw new Error(
      "Missing tests/fixtures/e2e-ids.json — run npm run db:seed first",
    );
  }
  return JSON.parse(readFileSync(path, "utf8")) as E2EIds;
}

export function emailForRole(role: E2ERole): string {
  return ROLE_EMAIL[role];
}

export function userIdForRole(ids: E2EIds, role: E2ERole): string {
  return ids.users[role];
}
