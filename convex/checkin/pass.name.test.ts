// checkin/pass: once a student is checked in, the name on their pass stays, whatever channel the
// pass page sends, and a second scan shows the name on their check-in (CKP-convex-1).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import { admin, at, checkIn, profEnv, setup, type T, typed } from "../test.helpers";

const CH = "gdg";
const T0 = at(2026, 11, 5, 21, 30);

// A typed sign-in with student 1's email: the same student to the server, whatever the name.
const as = (t: T, name: string) => typed(t, name, "student1@example.edu");
const nameOnPass = async (t: T) => (await as(t, "any").query(api.checkin.pass.mine, {}))!.name;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  profEnv();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("CKP-convex-1 a checked-in student's name stays", () => {
  it("a refresh that names another channel doesn't rename a student checked in on gdg", async () => {
    const t = setup();
    await checkIn(t, as(t, "Sample student 1"), CH);
    await as(t, "Someone else").mutation(api.checkin.pass.refresh, { channel: "nope" });
    expect(await nameOnPass(t)).toBe("Sample student 1");
  });

  it("before the scan, a fixed name still goes through on any channel", async () => {
    const t = setup();
    await checkIn(t, typed(t, "Sample student 2", "student2@example.edu"), CH); // the class is open
    await as(t, "Sampel student 1").mutation(api.checkin.pass.refresh, { channel: CH });
    await as(t, "Sample student 1").mutation(api.checkin.pass.refresh, { channel: "nope" });
    expect(await nameOnPass(t)).toBe("Sample student 1");
  });

  it("a second scan shows the name on the check-in, even when the pass says something else", async () => {
    const t = setup();
    await checkIn(t, as(t, "Sample student 1"), CH);
    const { code } = (await as(t, "any").query(api.checkin.pass.mine, {}))!;
    // A pass renamed some other way (an old server, a direct write).
    await t.run(async (ctx) => {
      const p = await ctx.db.query("passes").withIndex("by_code", (q) => q.eq("code", code)).first();
      await ctx.db.patch("passes", p!._id, { name: "Someone else" });
    });
    const reply = await admin(t).mutation(api.checkin.pass.scan, { channel: CH, code });
    expect(reply).toMatchObject({ name: "Sample student 1", already: true });
  });
});
