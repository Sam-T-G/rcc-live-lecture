// checkin/prof.ts isDevBackend: a typed sign-in holds a role only on a backend the code names as
// dev. Any other CONVEX_CLOUD_URL counts as prod: a custom domain on prod, a new prod deployment,
// or a URL that only mentions a dev deployment's name somewhere.
import { describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import { ADMIN_EMAIL, DEV_URL, PROF_EMAIL, TEST_PROF_EMAIL, admin, grant, profEnv, setup, testGrant, typed } from "../test.helpers";
import * as prof from "./prof";

const CH = "gdg";
// This laptop's dev deployment (README, AGENTS.md).
const LAPTOP_DEV_URL = "https://quaint-swan-637.convex.cloud";

// URLs prod could report that name no dev deployment: a custom canonical domain, a new prod
// deployment, and URLs with a dev deployment's name in the wrong place.
const NOT_DEV = [
  "https://api.example.com",
  "https://brave-otter-123.convex.cloud",
  "https://quaint-swan-637.example.com",
  "https://quaint-swan-637.convex.cloud.example.com",
  "https://example.com/quaint-swan-637.convex.cloud",
  "https://api.example.com/?quaint-swan-637",
  "http://quaint-swan-637.convex.cloud",
  "https://sample-dev-123.convex.cloud.example.com",
  "quaint-swan-637.convex.cloud",
  "not a url",
];

describe("ROLES isDevBackend fails closed", () => {
  it("ROLES a typed admin email gets no role under a URL that names no dev deployment", async () => {
    profEnv();
    const t = setup();
    await grant(t, PROF_EMAIL, "professor");
    await testGrant(t, TEST_PROF_EMAIL, "professor");
    for (const url of NOT_DEV) {
      vi.stubEnv("CONVEX_CLOUD_URL", url);
      expect([url, prof.isDevBackend()]).toEqual([url, false]);
      expect(await typed(t, "Sample professor 1", TEST_PROF_EMAIL).query(api.checkin.pass.amHost, {})).toBe(false);
      const as = typed(t, "Sample admin", ADMIN_EMAIL);
      expect(await as.query(api.staff.me, {})).toEqual({ email: ADMIN_EMAIL, role: null, canHoldRole: false });
      expect(await as.query(api.checkin.pass.amHost, {})).toBe(false);
      await expect(as.query(api.staff.people, {})).rejects.toThrow("Only admins can do that.");
      await expect(typed(t, "Sample professor", PROF_EMAIL).query(api.checkin.read.names, { channel: CH })).rejects.toThrow(
        "Only professors can do that.",
      );
      await expect(t.mutation(internal.staff.devGrant, { email: "prof1@test.local", role: "professor" })).rejects.toThrow(
        "staff:devGrant runs only on the dev backends in DEV_HOSTS in convex/checkin/prof.ts, and ",
      );
      // Google sign-ins keep their roles whatever the URL.
      expect(await admin(t).query(api.checkin.pass.amHost, {})).toBe(true);
    }
  });

  it("ROLES the dev deployments the code names count as dev, in any case and with a trailing slash", async () => {
    profEnv();
    const t = setup();
    await testGrant(t, TEST_PROF_EMAIL, "professor");
    for (const url of [LAPTOP_DEV_URL, LAPTOP_DEV_URL.toUpperCase(), `${LAPTOP_DEV_URL}/`, ` ${LAPTOP_DEV_URL} `, DEV_URL]) {
      vi.stubEnv("CONVEX_CLOUD_URL", url);
      expect([url, prof.isDevBackend()]).toEqual([url, true]);
      expect(await typed(t, "Sample professor 1", TEST_PROF_EMAIL).query(api.checkin.pass.amHost, {})).toBe(true);
    }
  });
});
