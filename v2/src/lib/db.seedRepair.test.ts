import { beforeEach, describe, expect, it } from "vitest";
import { db, seedInitialDataIfEmpty } from "./db";

beforeEach(async () => {
  await db.evaluations.clear();
  await db.profiles.clear();
  await db.summary_groups.clear();
});

describe("seedInitialDataIfEmpty repair", () => {
  it("drops a hidden third Block 41 entry and a letter-leading sample UIC", async () => {
    await db.evaluations.put({
      id: "eval-sample-001",
      report_type: "EVAL",
      member_name: "FRANKLYN, DAIN A",
      dod_id: "1234567890",
      uic: "N0024",
      career_recommendations: ["CHIEF PETTY OFFICER", "LPO", "DLCPO ASSISTANT"],
      block_values: { reporting_senior_uic: "N0024", reporting_senior_name: "KIRK, J T" },
      status: "draft",
    } as never);
    await db.profiles.put({
      id: "profile-active-user",
      first_name: "DAIN",
      last_name: "FRANKLYN",
      uic: "N0024",
      preferred_role: "Reporting Senior",
    } as never);

    await seedInitialDataIfEmpty();

    const ev = await db.evaluations.get("eval-sample-001");
    expect(ev?.career_recommendations).toEqual(["CHIEF PETTY OFFICER", "LPO"]);
    expect(ev?.uic).toBe("00024");
    expect(ev?.block_values?.reporting_senior_uic).toBe("00024");
    expect((await db.profiles.get("profile-active-user"))?.uic).toBe("00024");
  });
});
