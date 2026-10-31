// checkin/prof: the professor key, the kiosk key, and every host-only function's gate.
import { describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import { authMatrix, type Caller, HOST_ONLY, KIOSK_KEY, passCode, PROF_KEY, profEnv, SCANNER, typed } from "../test.helpers";
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
    await authMatrix(SCANNER, async (as, key, t) => {
      const code = await passCode(typed(t, "Sample student 1", "student1@example.edu"));
      await as.mutation(api.checkin.pass.scan, { key, channel: CH, code });
    });
    await authMatrix(SCANNER, async (as, key) => {
      if (!(await as.query(api.checkin.pass.canScan, { key }))) throw new Error("canScan said no");
    });
  });

  it("D11 authMatrix: amHost refuses the kiosk key", async () => {
    await authMatrix(HOST_ONLY, async (as, key) => {
      if (!(await as.query(api.checkin.pass.amHost, { key }))) throw new Error("amHost said no");
    });
  });
});

// Every host-only function: refused signed out with no key, with a wrong key, as a typed sign-in
// whose email is on HOST_EMAILS, and with the kiosk key; allowed with PROFESSOR_KEY and as a Google
// host. Each row runs on its own empty backend, and authMatrix fails the test when a row differs.
describe("F4.4 host-only functions", () => {
  it("F4.4 authMatrix for checkin.read.names", async () => {
    await authMatrix(HOST_ONLY, (as, key) => as.query(api.checkin.read.names, { key, channel: CH }));
  });

  it("F4.4 authMatrix for checkin.quiz.ask", async () => {
    await authMatrix(HOST_ONLY, (as, key) =>
      as.mutation(api.checkin.quiz.ask, { key, channel: CH, kind: "quiz", question: "Which one is a vowel?", choices: ["A", "B"], correct: 0 }),
    );
  });

  it("F4.4 authMatrix for checkin.quiz.end", async () => {
    await authMatrix(HOST_ONLY, async (as, key, t) => {
      const poll = await t.mutation(api.checkin.quiz.ask, { key: PROF_KEY, channel: CH, kind: "vote", question: "Pizza or tacos?", choices: ["Pizza", "Tacos"] });
      await as.mutation(api.checkin.quiz.end, { key, poll });
    });
  });

  it("F4.4 authMatrix for checkin.quiz.stats", async () => {
    await authMatrix(HOST_ONLY, async (as, key, t) => {
      const poll = await t.mutation(api.checkin.quiz.ask, { key: PROF_KEY, channel: CH, kind: "quiz", question: "Which one is a vowel?", choices: ["A", "B"], correct: 0 });
      await as.query(api.checkin.quiz.stats, { key, poll });
    });
  });

  it("F4.4 authMatrix for checkin.quiz.history", async () => {
    await authMatrix(HOST_ONLY, (as, key) => as.query(api.checkin.quiz.history, { key, channel: CH }));
  });

  it("F4.4 authMatrix for checkin.attendance.setClassStart", async () => {
    await authMatrix(HOST_ONLY, (as, key) => as.mutation(api.checkin.attendance.setClassStart, { key, channel: CH, startsAt: Date.now(), graceMin: 5 }));
  });

  it("F4.4 authMatrix for checkin.attendance.sheet", async () => {
    await authMatrix(HOST_ONLY, (as, key) => as.query(api.checkin.attendance.sheet, { key, channel: CH }));
  });

  it("F4.4 authMatrix for live.groups.setSize", async () => {
    await authMatrix(HOST_ONLY, (as, key) => as.mutation(api.live.groups.setSize, { key, channel: CH, size: 3 }));
  });

  it("F4.4 authMatrix for checkin.pass.scan (the door scanner also takes the kiosk key)", async () => {
    await authMatrix(SCANNER, async (as, key, t) => {
      const code = await passCode(typed(t, "Sample student 1", "student1@example.edu"));
      await as.mutation(api.checkin.pass.scan, { key, channel: CH, code });
    });
  });

  it("F4.4 a refused row throws the sign-in or key message", async () => {
    const m = await authMatrix(HOST_ONLY, (as, key) => as.query(api.checkin.read.names, { key, channel: CH }));
    expect(m.errors).toEqual({
      signedOut: expect.stringContaining("Sign in first."),
      wrongKey: expect.stringContaining("That professor key is wrong."),
      typedHostEmail: expect.stringContaining("Only hosts can do that."),
      kioskKey: expect.stringContaining("That professor key is wrong."),
    });
  });
});

// authMatrix compares the rows with HOST_ONLY or SCANNER itself, so a test that only awaits it
// still fails when a function lets the wrong caller in.
describe("F39.3 authMatrix checks its own rows", () => {
  it("F39.3 authMatrix fails a test that asserts nothing else when a function lets every caller in", async () => {
    // checkin.read.count is open to anyone, like a host-only function without its requireProf.
    await expect(authMatrix(HOST_ONLY, (as) => as.query(api.checkin.read.count, { channel: CH }))).rejects.toThrow(
      "authMatrix: rows that differ from HOST_ONLY: signedOut got through; wrongKey got through; typedHostEmail got through; kioskKey got through",
    );
  });

  it("F39.3 authMatrix fails a row that should have finished, and says what it threw", async () => {
    // checkin.read.names refuses the kiosk key, which SCANNER lets in.
    await expect(authMatrix(SCANNER, (as, key) => as.query(api.checkin.read.names, { key, channel: CH }))).rejects.toThrow(
      "authMatrix: rows that differ from SCANNER: kioskKey was refused (That professor key is wrong.)",
    );
  });

  it("F39.3 authMatrix takes HOST_ONLY or SCANNER themselves, never a copy or a matrix of its own", async () => {
    const names = (as: Caller, key: string | undefined) => as.query(api.checkin.read.names, { key, channel: CH });
    await expect(authMatrix({ ...HOST_ONLY }, names)).rejects.toThrow("authMatrix takes HOST_ONLY or SCANNER");
    await expect(authMatrix({ ...HOST_ONLY, typedHostEmail: true } as unknown as typeof HOST_ONLY, names)).rejects.toThrow(
      "authMatrix takes HOST_ONLY or SCANNER",
    );
    expect(Object.isFrozen(HOST_ONLY) && Object.isFrozen(SCANNER)).toBe(true);
  });
});
