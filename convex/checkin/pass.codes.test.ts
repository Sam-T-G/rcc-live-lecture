// checkin/pass: two passes can never share a code (CKP-convex-2). refresh draws a new code until
// no pass has it as its code or as the code before it, and scan picks the one pass whose code
// still scans when older rows (from before refresh checked) share it, instead of throwing.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import { admin, at, profEnv, setup, type T, typed } from "../test.helpers";

const CH = "gdg";
const T0 = at(2026, 11, 5, 21, 30);
const HOUR = 60 * 60_000;
const NOT_A_PASS = "That code isn't a pass. Ask them to open their pass again.";

const student = (t: T, n: number) => typed(t, `Sample student ${n}`, `student${n}@example.edu`);
const scan = (t: T, code: string) => admin(t).mutation(api.checkin.pass.scan, { channel: CH, code });
// A pass row written straight to the table, the way an old pass sits in it.
const passRow = (t: T, n: number, code: string, prevCode: string, made: number) =>
  t.run((ctx) =>
    ctx.db.insert("passes", { user: `old-${n}`, name: `Sample student ${n}`, email: `student${n}@example.edu`, code, prevCode, at: made }),
  );

// The codes refresh draws, in order: randomCode maps each random byte to LETTERS[byte % 32], so
// a byte of i gives the i-th letter (0 = "A", 1 = "B", 2 = "C").
function drawCodes(...letters: number[]) {
  const queue = [...letters];
  vi.spyOn(crypto, "getRandomValues").mockImplementation(<A extends ArrayBufferView | null>(bytes: A) => {
    const next = queue.shift();
    if (next === undefined) throw new Error("drawCodes: the test ran out of codes");
    if (bytes instanceof Uint8Array) bytes.fill(next);
    return bytes;
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  profEnv();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("CKP-convex-2 every pass code is on one pass", () => {
  it("a new pass skips a code another pass has as its code, or as the code before it, and its code scans", async () => {
    const t = setup();
    await passRow(t, 2, "AAAAAA", "", T0 - HOUR); // a pass whose phone slept an hour ago
    await passRow(t, 3, "CCCCCC", "BBBBBB", T0 - 5_000); // a live pass: BBBBBB was replaced 5 s ago
    drawCodes(0, 1, 2, 3); // AAAAAA, BBBBBB, CCCCCC, then DDDDDD
    const s = student(t, 1);
    await s.mutation(api.checkin.pass.refresh, { channel: CH });
    vi.restoreAllMocks();
    expect((await s.query(api.checkin.pass.mine, {}))!.code).toBe("DDDDDD");
    expect(await scan(t, "DDDDDD")).toMatchObject({ name: "Sample student 1", already: false });
  });

  it("a new code for an existing pass skips codes other passes hold", async () => {
    const t = setup();
    drawCodes(4); // EEEEEE
    const s = student(t, 1);
    await s.mutation(api.checkin.pass.refresh, { channel: CH });
    await passRow(t, 2, "FFFFFF", "", T0);
    vi.setSystemTime(T0 + 20_000);
    drawCodes(5, 6); // FFFFFF (taken), then GGGGGG
    await s.mutation(api.checkin.pass.refresh, { channel: CH });
    vi.restoreAllMocks();
    expect((await s.query(api.checkin.pass.mine, {}))!.code).toBe("GGGGGG");
  });

  it("after 5 taken codes in a row, refresh says so and makes no pass", async () => {
    const t = setup();
    await passRow(t, 2, "PPPPPP", "", T0 - HOUR);
    drawCodes(13, 13, 13, 13, 13); // PPPPPP five times (LETTERS has no I or O)
    const s = student(t, 1);
    await expect(s.mutation(api.checkin.pass.refresh, { channel: CH })).rejects.toThrow("Couldn't make a new code. Try again.");
    vi.restoreAllMocks();
    expect(await s.query(api.checkin.pass.mine, {})).toBeNull();
  });

  it("a code an old pass also has scans as the live pass's code, not a server error", async () => {
    const t = setup();
    // Two passes with one code, the way refresh could make them before it checked.
    await passRow(t, 2, "HHHHHH", "", T0 - HOUR);
    await passRow(t, 1, "HHHHHH", "", T0 - 5_000);
    expect(await scan(t, "HHHHHH")).toMatchObject({ name: "Sample student 1", already: false });
  });

  it("a code that is the code before the current one on two passes checks in the pass it still scans for", async () => {
    const t = setup();
    await passRow(t, 2, "JJJJJJ", "KKKKKK", T0 - HOUR); // KKKKKK ran out an hour ago on student 2's pass
    await passRow(t, 1, "LLLLLL", "KKKKKK", T0 - 5_000); // and was replaced 5 s ago on student 1's
    expect(await scan(t, "KKKKKK")).toMatchObject({ name: "Sample student 1", already: false });
  });

  it("a code two live passes share is refused with a message, so the scanner asks for a new one", async () => {
    const t = setup();
    await passRow(t, 1, "MMMMMM", "", T0 - 5_000);
    await passRow(t, 2, "MMMMMM", "", T0 - 3_000);
    await expect(scan(t, "MMMMMM")).rejects.toThrow(NOT_A_PASS);
  });

  it("an old pass whose new code came out the same as the one it replaced still scans", async () => {
    const t = setup();
    await passRow(t, 1, "NNNNNN", "NNNNNN", T0 - 5_000);
    expect(await scan(t, "NNNNNN")).toMatchObject({ name: "Sample student 1", already: false });
  });
});
