// The 12-hour close for classes (the `lectures` table). lib.ensureLecture schedules `close` for
// every class it opens, so a class nobody ended with End day still ends 12 hours after it opened.
// Without it, last week's class would still be open next week: its students would still count as
// checked in, so their pass page would say "You're checked in." instead of showing a QR, and the
// door couldn't scan them until the professor pressed the deck. A class that already ended (End
// day, or lib.ensureLecture finding it open past 12 hours) stays as it is.
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { LECTURE_MS } from "./lib";

export const close = internalMutation({
  args: { lecture: v.id("lectures") },
  returns: v.null(),
  handler: async (ctx, { lecture }): Promise<null> => {
    const row = await ctx.db.get("lectures", lecture);
    if (!row || row.endedAt !== undefined) return null;
    // The scheduled run ends the class at its 12-hour mark, even when the job runs late. Run by
    // hand before then (npx convex run lectures:close), it ends the class now, so no class ever
    // has an end time in the future.
    await ctx.db.patch("lectures", lecture, { endedAt: Math.min(Date.now(), row.startedAt + LECTURE_MS) });
    return null;
  },
});
