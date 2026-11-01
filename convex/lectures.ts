// The 12-hour close for classes (the `lectures` table). lib.ensureLecture schedules `close` for
// every class it opens, so a class nobody ended with End day still ends by itself: 12 hours after
// it opened, or 12 hours after its saved start time when that is later (lib.lectureClosesAt).
// Without it, last week's class would still be open next week: its students would still count as
// checked in, so their pass page would say "You're checked in." instead of showing a QR, and the
// door couldn't scan them until the professor pressed the deck. A class that already ended (End
// day, or lib.ensureLecture finding it open past its close time) stays as it is. Closing saves the
// teams' extra credit the way End day does (live/groups.ts saveExtraCredit).
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { lectureClosesAt } from "./lib";
import { saveExtraCredit } from "./live/groups";

export const close = internalMutation({
  // `scheduled` is true for the job lib.ensureLecture queues; leave it out when running by hand.
  args: { lecture: v.id("lectures"), scheduled: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, { lecture, scheduled }): Promise<null> => {
    const row = await ctx.db.get("lectures", lecture);
    if (!row || row.endedAt !== undefined) return null;
    const closesAt = lectureClosesAt(row);
    // A saved start time moved the close later (a class opened the evening before its morning
    // start): the scheduled job waits until then.
    if (scheduled && Date.now() < closesAt) {
      await ctx.scheduler.runAt(closesAt, internal.lectures.close, { lecture, scheduled: true });
      return null;
    }
    // The scheduled run ends the class at its close time, even when the job runs late. Run by
    // hand before then (npx convex run lectures:close), it ends the class now, so no class ever
    // has an end time in the future. The teams' extra credit is saved first, as End day saves it,
    // so a class nobody ended with End day keeps it.
    const endedAt = Math.min(Date.now(), closesAt);
    await saveExtraCredit(ctx, row.channel, endedAt, lecture);
    await ctx.db.patch("lectures", lecture, { endedAt });
    return null;
  },
});
