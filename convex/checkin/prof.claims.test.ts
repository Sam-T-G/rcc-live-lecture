// checkin/prof: which sign-in claims let an email hold a role (provenEmail), built the way the real
// tokens arrive rather than the way the shared test helpers build them. A typed token from
// src/blocks/devLogin.ts carries the raw JWT claim `email_verified`, and a customJwt provider can
// hand claims to the function under their own names, so the identity may have `email_verified`
// and no `emailVerified`. A Google identity must say its email is verified, or it holds no role.
import { describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import { ADMIN_EMAIL, DEV_URL, GOOGLE_ISSUER, PROD_URL, PROF_EMAIL, grant, profEnv, setup, type T, TYPED_ISSUER } from "../test.helpers";
import { provenEmail } from "./prof";

// A typed sign-in with only the claims a customJwt token can carry: `email_verified` under its
// JWT name, or no verification claim at all.
const rawTyped = (t: T, email: string, claims: { emailVerified?: boolean; email_verified?: boolean }) =>
  t.withIdentity({ issuer: TYPED_ISSUER, subject: email.toLowerCase(), name: "Sample professor 1", email, ...claims });

// A Google sign-in with the given verification claims (or none).
const rawGoogle = (t: T, email: string, claims: { emailVerified?: boolean; email_verified?: boolean }) =>
  t.withIdentity({ issuer: GOOGLE_ISSUER, subject: "google-" + email, name: "Sample professor", email, ...claims });

describe("ROLES-API-check-1 a real typed sign-in holds its devGrant role on a dev backend", () => {
  it("ROLES-API-check-1 typed identity with email_verified and no emailVerified opens the professor pages after devGrant on dev", async () => {
    vi.stubEnv("CONVEX_CLOUD_URL", DEV_URL);
    const t = setup();
    await t.mutation(internal.staff.devGrant, { email: "prof1@test.local", role: "professor" });
    for (const claims of [{ email_verified: true }, {}]) {
      const as = rawTyped(t, "prof1@test.local", claims);
      expect(await as.query(api.staff.me, {})).toEqual({ email: "prof1@test.local", role: "professor", canHoldRole: true });
      expect(await as.query(api.checkin.pass.amHost, {})).toBe(true);
      expect(await as.query(api.checkin.pass.canScan, {})).toBe(true);
    }
  });

  it("ROLES-API-check-1 the same typed identity holds nothing on prod", async () => {
    vi.stubEnv("CONVEX_CLOUD_URL", PROD_URL);
    profEnv();
    const t = setup();
    await grant(t, PROF_EMAIL, "professor");
    for (const email of [PROF_EMAIL, ADMIN_EMAIL]) {
      for (const claims of [{ email_verified: true }, { emailVerified: true }, {}]) {
        const as = rawTyped(t, email, claims);
        expect(await as.query(api.staff.me, {})).toEqual({ email, role: null, canHoldRole: false });
        expect(await as.query(api.checkin.pass.amHost, {})).toBe(false);
      }
    }
  });
});

describe("ROLES-API-risk-7 a Google sign-in needs a verified email to hold a role", () => {
  it("ROLES-API-risk-7 a Google identity with no email verification claim holds no role", async () => {
    profEnv();
    const t = setup();
    await grant(t, PROF_EMAIL, "professor");
    for (const email of [PROF_EMAIL, ADMIN_EMAIL]) {
      for (const claims of [{}, { emailVerified: false }, { email_verified: false }]) {
        const as = rawGoogle(t, email, claims);
        expect(await as.query(api.staff.me, {})).toEqual({ email, role: null, canHoldRole: false });
        expect(await as.query(api.checkin.pass.amHost, {})).toBe(false);
      }
    }
  });

  it("ROLES-API-risk-7 a Google identity holds its role when its email is verified under either claim name", async () => {
    profEnv();
    const t = setup();
    await grant(t, PROF_EMAIL, "professor");
    for (const claims of [{ emailVerified: true }, { email_verified: true }]) {
      expect(await rawGoogle(t, PROF_EMAIL, claims).query(api.staff.me, {})).toEqual({ email: PROF_EMAIL, role: "professor", canHoldRole: true });
      expect(await rawGoogle(t, ADMIN_EMAIL, claims).query(api.staff.me, {})).toEqual({ email: ADMIN_EMAIL, role: "admin", canHoldRole: true });
    }
  });

  it("ROLES-API-risk-7 provenEmail: Google needs a true verification claim, a string 'true' doesn't count, another issuer never counts", () => {
    vi.stubEnv("CONVEX_CLOUD_URL", DEV_URL);
    expect(provenEmail({ issuer: GOOGLE_ISSUER, email: PROF_EMAIL })).toBeNull();
    expect(provenEmail({ issuer: GOOGLE_ISSUER, email: PROF_EMAIL, email_verified: "true" })).toBeNull();
    expect(provenEmail({ issuer: GOOGLE_ISSUER, email: " Prof@Example.edu ", emailVerified: true })).toBe(PROF_EMAIL);
    expect(provenEmail({ issuer: "https://other.example.edu", email: PROF_EMAIL, emailVerified: true, email_verified: true })).toBeNull();
    expect(provenEmail({ issuer: TYPED_ISSUER, email: "", email_verified: true })).toBeNull();
    expect(provenEmail(null)).toBeNull();
  });
});
