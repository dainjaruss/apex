// tests/unit/middlewareRedirect.test.ts
//
// getRedirectTarget is the whole auth-gating decision in middleware.ts. The
// protected-prefix list drifted behind two shipped features (/board-confidence
// and /brag-sheet were never added), so it is asserted directly rather than
// through a mocked Supabase round-trip — the existing coverage suite already
// exercises the middleware() wrapper and only checks that it returns something.

import { describe, it, expect } from "vitest";
import { getRedirectTarget } from "@/middleware";

const anon = null;
const signedIn = { id: "user-1" };

describe("middleware getRedirectTarget", () => {
  describe("anonymous visitors are sent to /login", () => {
    // The two that were missing. Both pages do their own client-side session
    // check and router.push("/login"), so the pre-fix impact was not a data
    // leak — RLS and the anon key still gated every read. It was that the page
    // shell rendered and ran before bouncing, and the server-side gate that
    // every other authenticated route has simply was not applied here.
    it.each([
      "/board-confidence",
      "/board-confidence/history",
      "/brag-sheet",
      "/brag-sheet/new",
    ])("redirects %s", (path) => {
      expect(getRedirectTarget(anon, path)).toBe("/login");
    });

    it.each([
      "/dashboard",
      "/profile",
      "/evaluations",
      "/evaluations/abc/edit",
      "/admin",
      "/summary-groups",
    ])("still redirects %s", (path) => {
      expect(getRedirectTarget(anon, path)).toBe("/login");
    });
  });

  it("leaves public routes alone for anonymous visitors", () => {
    expect(getRedirectTarget(anon, "/login")).toBeNull();
    expect(getRedirectTarget(anon, "/register")).toBeNull();
    expect(getRedirectTarget(anon, "/")).toBeNull();
  });

  it("does not redirect signed-in users away from the new routes", () => {
    expect(getRedirectTarget(signedIn, "/board-confidence")).toBeNull();
    expect(getRedirectTarget(signedIn, "/brag-sheet")).toBeNull();
  });

  it("bounces signed-in users off the auth routes to /dashboard", () => {
    expect(getRedirectTarget(signedIn, "/login")).toBe("/dashboard");
    expect(getRedirectTarget(signedIn, "/register")).toBe("/dashboard");
    expect(getRedirectTarget(signedIn, "/")).toBe("/dashboard");
  });
});
