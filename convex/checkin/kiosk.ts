// Check-in: the kiosk's code and the check-in itself. The kiosk (a host's laptop at the
// door) shows a QR with a code that changes every 20 seconds; a phone that scans it signs
// in, shares its location once, and gets a row in `checkins` if the code is fresh and the
// phone is near the room.
import { mutation, query } from "../_generated/server";
import { ConvexError, v } from "convex/values";
import { metersBetween, randomCode, requireHost, requireUser } from "../lib";

const EVERY = 20_000; // a new code every 20 seconds
const GRACE = 45_000; // the code before it still works this long, for a slow scan
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

async function kioskFor(ctx: Parameters<typeof requireUser>[0], channel: string) {
  return await ctx.db.query("kiosks").withIndex("by_channel", (q) => q.eq("channel", channel)).unique();
}

// Open (or reopen) the kiosk. Where the host's laptop is becomes where the room is.
export const start = mutation({
  args: { channel: v.string(), lat: v.optional(v.number()), lng: v.optional(v.number()), radius: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, { channel, lat, lng, radius }) => {
    await requireHost(ctx);
    const row = await kioskFor(ctx, channel);
    const code = randomCode(8, ALPHABET);
    const room = { lat, lng, radius: lat !== undefined ? (radius ?? 150) : undefined };
    if (row) await ctx.db.patch(row._id, { code, prevCode: row.code, at: Date.now(), ...room });
    else await ctx.db.insert("kiosks", { channel, code, prevCode: "", at: Date.now(), ...room });
    return null;
  },
});

// The kiosk calls this every few seconds; it only makes a new code once the old one is 20 s old.
export const rotate = mutation({
  args: { channel: v.string() },
  returns: v.null(),
  handler: async (ctx, { channel }) => {
    await requireHost(ctx);
    const row = await kioskFor(ctx, channel);
    if (!row || Date.now() - row.at < EVERY - 500) return null;
    await ctx.db.patch(row._id, { code: randomCode(8, ALPHABET), prevCode: row.code, at: Date.now() });
    return null;
  },
});

// What the kiosk shows. Hosts only: anyone who could read the code could check in from home.
export const current = query({
  args: { channel: v.string() },
  returns: v.union(v.null(), v.object({ code: v.string(), at: v.number(), room: v.boolean() })),
  handler: async (ctx, { channel }) => {
    await requireHost(ctx);
    const row = await kioskFor(ctx, channel);
    return row ? { code: row.code, at: row.at, room: row.lat !== undefined } : null;
  },
});

// A phone checks in with the code it scanned and, if the kiosk set a room, its location.
export const join = mutation({
  args: { channel: v.string(), code: v.string(), lat: v.optional(v.number()), lng: v.optional(v.number()), accuracy: v.optional(v.number()) },
  returns: v.object({ already: v.boolean(), meters: v.union(v.number(), v.null()) }),
  handler: async (ctx, { channel, code, lat, lng, accuracy }) => {
    const me = await requireUser(ctx);
    const row = await kioskFor(ctx, channel);
    if (!row) throw new ConvexError("Check-in isn't open yet.");
    const fresh = code === row.code || (code === row.prevCode && Date.now() - row.at < GRACE);
    if (!fresh) throw new ConvexError("That code expired. Scan the one on the screen now.");
    let meters: number | null = null;
    if (row.lat !== undefined && row.lng !== undefined) {
      if (lat === undefined || lng === undefined) throw new ConvexError("Share your location to check in.");
      meters = Math.round(metersBetween(row.lat, row.lng, lat, lng));
      // Indoor phone location is often 20 to 100 m off, so allow for what the phone reports.
      const slack = Math.min(accuracy ?? 50, 150);
      if (meters > (row.radius ?? 150) + slack) throw new ConvexError(`You look about ${meters} m from the room. Check in from inside it.`);
    }
    const had = await ctx.db
      .query("checkins")
      .withIndex("by_channel_and_user", (q) => q.eq("channel", channel).eq("user", me.tokenIdentifier))
      .unique();
    if (had) return { already: true, meters: had.meters ?? null };
    await ctx.db.insert("checkins", { channel, user: me.tokenIdentifier, name: me.name ?? me.email ?? "Student", at: Date.now(), meters: meters ?? undefined });
    return { already: false, meters };
  },
});
