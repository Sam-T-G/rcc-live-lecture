// convex/lib.ts: who is signed in, who is a host, and the small helpers every module uses.
import { describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import { isHostEmail, isHostIdentity, metersBetween, randomCode, requireHost, requireUser } from "./lib";
import { GOOGLE_ISSUER, googleHost, HOST_EMAIL, profEnv, setup, TYPED_ISSUER, typed } from "./test.helpers";

describe("F1 hosts are Google accounts on HOST_EMAILS", () => {
  it("F1.4 isHostIdentity is false for a typed identity whose email is on HOST_EMAILS and true for a Google identity with that email", async () => {
    profEnv();
    expect(isHostIdentity({ issuer: TYPED_ISSUER, email: HOST_EMAIL, emailVerified: true })).toBe(false);
    expect(isHostIdentity({ issuer: GOOGLE_ISSUER, email: HOST_EMAIL, emailVerified: true })).toBe(true);
    expect(isHostIdentity({ issuer: GOOGLE_ISSUER, email: HOST_EMAIL, emailVerified: false })).toBe(false);
    expect(isHostIdentity({ issuer: GOOGLE_ISSUER, email: "student1@example.edu", emailVerified: true })).toBe(false);
    expect(isHostIdentity(null)).toBe(false);

    const t = setup();
    expect(await typed(t, "Sample professor", HOST_EMAIL).query(api.checkin.pass.amHost, {})).toBe(false);
    await expect(typed(t, "Sample professor", HOST_EMAIL).query(api.checkin.read.names, { channel: "gdg" })).rejects.toThrow("Only hosts can do that.");
    expect(await googleHost(t).query(api.checkin.pass.amHost, {})).toBe(true);
  });

  it("F1.4 isHostEmail is case-insensitive and ignores spaces and empty entries", () => {
    vi.stubEnv("HOST_EMAILS", " Prof@Example.edu , ,second@example.edu");
    expect(isHostEmail("prof@example.edu")).toBe(true);
    expect(isHostEmail("PROF@EXAMPLE.EDU")).toBe(true);
    expect(isHostEmail("second@example.edu")).toBe(true);
    expect(isHostEmail("student1@example.edu")).toBe(false);
    expect(isHostEmail("")).toBe(false);
    expect(isHostEmail(undefined)).toBe(false);
    vi.stubEnv("HOST_EMAILS", undefined);
    expect(isHostEmail("prof@example.edu")).toBe(false);
  });

  it("F1.4 requireUser throws 'Sign in first.' signed out; requireHost throws 'Only hosts can do that.' for a typed sign-in on HOST_EMAILS", async () => {
    profEnv();
    const t = setup();
    await expect(t.run((ctx) => requireUser(ctx))).rejects.toThrow("Sign in first.");
    await expect(t.run((ctx) => requireHost(ctx))).rejects.toThrow("Sign in first.");
    const me = await typed(t, "Sample student 1", "student1@example.edu").run((ctx) => requireUser(ctx));
    expect(me).toMatchObject({ issuer: TYPED_ISSUER, email: "student1@example.edu" });
    await expect(typed(t, "Sample professor", HOST_EMAIL).run((ctx) => requireHost(ctx))).rejects.toThrow("Only hosts can do that.");
    expect(await googleHost(t).run((ctx) => requireHost(ctx))).toMatchObject({ issuer: GOOGLE_ISSUER, email: HOST_EMAIL });
  });
});

describe("F39.6 small helpers", () => {
  it("F39.6 randomCode uses only its alphabet and length", () => {
    const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const code = randomCode(6, LETTERS);
      expect(code).toHaveLength(6);
      for (const c of code) {
        expect(LETTERS).toContain(c);
        seen.add(c);
      }
    }
    expect(seen.size).toBeGreaterThan(20); // not one letter over and over
    expect(randomCode(10)).toMatch(/^[a-z0-9]{10}$/);
    expect(randomCode(0)).toBe("");
  });

  it("F39.6 metersBetween matches a known distance", () => {
    // One degree of latitude along a meridian is 2 * pi * 6,371,000 m / 360 = 111,194.93 m.
    expect(metersBetween(0, 0, 1, 0)).toBeCloseTo(111_194.93, 1);
    // A quarter of the way around the equator.
    expect(metersBetween(0, 0, 0, 90)).toBeCloseTo((Math.PI / 2) * 6_371_000, 3);
    expect(metersBetween(33.97, -117.38, 33.97, -117.38)).toBe(0);
    expect(metersBetween(33.97, -117.38, 34.0, -117.4)).toBeCloseTo(metersBetween(34.0, -117.4, 33.97, -117.38), 6);
  });
});
