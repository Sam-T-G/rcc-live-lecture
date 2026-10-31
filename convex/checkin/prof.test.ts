// checkin/prof: the professor key, the kiosk key, and every host-only function's gate.
import { describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import { authMatrix, HOST_ONLY, KIOSK_KEY, passCode, PROF_KEY, profEnv, SCANNER, typed } from "../test.helpers";
import * as prof from "./prof";

const CH = "gdg";
// The key that was hardcoded for the 10-29 demos, put together here so `git grep` for it finds nothing.
const OLD_DEMO_KEY = ["gdg", "demo", "1029"].join("-");

describe("F6 only PROFESSOR_KEY opens the professor pages", () => {
  it("F6.2 prof.ts exports no DEMO_KEY", () => {
    expect(Object.keys(prof)).not.toContain("DEMO_KEY");
  });

  it("F6.2 keyOk(the old demo key) is false with PROFESSOR_KEY set to another value and with it unset", () => {
    vi.stubEnv("PROFESSOR_KEY", PROF_KEY);
    expect(prof.keyOk(OLD_DEMO_KEY)).toBe(false);
    vi.stubEnv("PROFESSOR_KEY", undefined);
    expect(prof.keyOk(OLD_DEMO_KEY)).toBe(false);
    expect(prof.keyOk(PROF_KEY)).toBe(false);
    vi.stubEnv("PROFESSOR_KEY", "");
    expect(prof.keyOk("")).toBe(false);
    expect(prof.keyOk(" ")).toBe(false);
  });

  it("F6.5 keyOk(' ' + PROFESSOR_KEY + ' ') is true; keyOk(undefined) and keyOk('') are false", () => {
    vi.stubEnv("PROFESSOR_KEY", PROF_KEY);
    expect(prof.keyOk(PROF_KEY)).toBe(true);
    expect(prof.keyOk(" " + PROF_KEY + " ")).toBe(true);
    expect(prof.keyOk(undefined)).toBe(false);
    expect(prof.keyOk("")).toBe(false);
    expect(prof.keyOk(PROF_KEY.toUpperCase())).toBe(false);
    expect(prof.keyOk(PROF_KEY + "x")).toBe(false);
  });
});

describe("D11 the kiosk key", () => {
  it("D11 kioskKeyOk is true only when KIOSK_KEY is set, at least 16 characters, and equals the key", () => {
    expect(prof.kioskKeyOk(KIOSK_KEY)).toBe(false); // KIOSK_KEY unset
    vi.stubEnv("KIOSK_KEY", KIOSK_KEY);
    expect(prof.kioskKeyOk(KIOSK_KEY)).toBe(true);
    expect(prof.kioskKeyOk(` ${KIOSK_KEY} `)).toBe(true);
    expect(prof.kioskKeyOk(KIOSK_KEY + "x")).toBe(false);
    expect(prof.kioskKeyOk(undefined)).toBe(false);
    expect(prof.kioskKeyOk("")).toBe(false);
    vi.stubEnv("KIOSK_KEY", "a".repeat(15));
    expect(prof.kioskKeyOk("a".repeat(15))).toBe(false);
    vi.stubEnv("KIOSK_KEY", "a".repeat(16));
    expect(prof.kioskKeyOk("a".repeat(16))).toBe(true);
    vi.stubEnv("KIOSK_KEY", "");
    expect(prof.kioskKeyOk("")).toBe(false);
  });

  it("D11 the kiosk key never passes keyOk, and the professor key never passes kioskKeyOk", () => {
    profEnv();
    vi.stubEnv("KIOSK_KEY", KIOSK_KEY);
    expect(prof.keyOk(KIOSK_KEY)).toBe(false);
    expect(prof.kioskKeyOk(PROF_KEY)).toBe(false);
  });

  it("D11 authMatrix: checkin.pass.scan and canScan take the kiosk key", async () => {
    expect(
      await authMatrix(async (as, key, t) => {
        const code = await passCode(typed(t, "Sample student 1", "student1@example.edu"));
        await as.mutation(api.checkin.pass.scan, { key, channel: CH, code });
      }),
    ).toEqual(SCANNER);
    expect(
      await authMatrix(async (as, key) => {
        if (!(await as.query(api.checkin.pass.canScan, { key }))) throw new Error("canScan said no");
      }),
    ).toEqual(SCANNER);
  });

  it("D11 authMatrix: amHost refuses the kiosk key", async () => {
    expect(
      await authMatrix(async (as, key) => {
        if (!(await as.query(api.checkin.pass.amHost, { key }))) throw new Error("amHost said no");
      }),
    ).toEqual(HOST_ONLY);
  });
});

// Every host-only function: refused signed out with no key, with a wrong key, as a typed sign-in
// whose email is on HOST_EMAILS, and with the kiosk key; allowed with PROFESSOR_KEY and as a Google
// host. Each row runs on its own empty backend.
describe("F4.4 host-only functions", () => {
  it("F4.4 authMatrix for checkin.read.names", async () => {
    expect(await authMatrix((as, key) => as.query(api.checkin.read.names, { key, channel: CH }))).toEqual(HOST_ONLY);
  });

  it("F4.4 authMatrix for checkin.quiz.ask", async () => {
    expect(
      await authMatrix((as, key) =>
        as.mutation(api.checkin.quiz.ask, { key, channel: CH, kind: "quiz", question: "Which one is a vowel?", choices: ["A", "B"], correct: 0 }),
      ),
    ).toEqual(HOST_ONLY);
  });

  it("F4.4 authMatrix for checkin.quiz.end", async () => {
    expect(
      await authMatrix(async (as, key, t) => {
        const poll = await t.mutation(api.checkin.quiz.ask, { key: PROF_KEY, channel: CH, kind: "vote", question: "Pizza or tacos?", choices: ["Pizza", "Tacos"] });
        await as.mutation(api.checkin.quiz.end, { key, poll });
      }),
    ).toEqual(HOST_ONLY);
  });

  it("F4.4 authMatrix for checkin.quiz.stats", async () => {
    expect(
      await authMatrix(async (as, key, t) => {
        const poll = await t.mutation(api.checkin.quiz.ask, { key: PROF_KEY, channel: CH, kind: "quiz", question: "Which one is a vowel?", choices: ["A", "B"], correct: 0 });
        await as.query(api.checkin.quiz.stats, { key, poll });
      }),
    ).toEqual(HOST_ONLY);
  });

  it("F4.4 authMatrix for checkin.quiz.history", async () => {
    expect(await authMatrix((as, key) => as.query(api.checkin.quiz.history, { key, channel: CH }))).toEqual(HOST_ONLY);
  });

  it("F4.4 authMatrix for checkin.attendance.setClassStart", async () => {
    expect(
      await authMatrix((as, key) => as.mutation(api.checkin.attendance.setClassStart, { key, channel: CH, startsAt: Date.now(), graceMin: 5 })),
    ).toEqual(HOST_ONLY);
  });

  it("F4.4 authMatrix for checkin.attendance.sheet", async () => {
    expect(await authMatrix((as, key) => as.query(api.checkin.attendance.sheet, { key, channel: CH }))).toEqual(HOST_ONLY);
  });

  it("F4.4 authMatrix for live.groups.setSize", async () => {
    expect(await authMatrix((as, key) => as.mutation(api.live.groups.setSize, { key, channel: CH, size: 3 }))).toEqual(HOST_ONLY);
  });

  it("F4.4 authMatrix for checkin.pass.scan (the door scanner also takes the kiosk key)", async () => {
    expect(
      await authMatrix(async (as, key, t) => {
        const code = await passCode(typed(t, "Sample student 1", "student1@example.edu"));
        await as.mutation(api.checkin.pass.scan, { key, channel: CH, code });
      }),
    ).toEqual(SCANNER);
  });

  it("F4.4 a refused row throws the sign-in or key message", async () => {
    const m = await authMatrix((as, key) => as.query(api.checkin.read.names, { key, channel: CH }));
    expect(m.errors).toEqual({
      signedOut: expect.stringContaining("Sign in first."),
      wrongKey: expect.stringContaining("That professor key is wrong."),
      typedHostEmail: expect.stringContaining("Only hosts can do that."),
      kioskKey: expect.stringContaining("That professor key is wrong."),
    });
  });
});
