// Block: lab. The functions #/lab calls to check each building block end to end. Nothing
// product-facing calls them.
//
// whoami, pings and lastPing are open to anyone. ping and aiPing are for professors and admins
// (requireProf, convex/checkin/prof.ts): anyone can make a typed sign-in with any email, so with
// only a sign-in check, anyone could spend the app's Gemini key through aiPing or add rows to
// `pings` without limit. Every error these functions throw is a ConvexError, so its words reach
// #/lab on prod too: prod sends the page "Server Error" in place of any other error.
import { v } from "convex/values";
import { action, mutation, query } from "./_generated/server";
import { requireUser } from "./lib";
import { isProf, requireProf, roleValidator, staffRole } from "./checkin/prof";
import { geminiText } from "./ai";

// The signed-in person as the server sees them, or null when signed out. role is "admin",
// "professor", "scanner" or null (no role, or a sign-in that can't hold one, such as a typed
// sign-in on prod). isHost is true for a professor or admin; #/lab tabs opened before role
// existed still read it.
export const whoami = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({ name: v.string(), email: v.string(), isHost: v.boolean(), role: v.union(v.null(), roleValidator) }),
  ),
  handler: async (ctx) => {
    const me = await ctx.auth.getUserIdentity();
    if (!me) return null;
    const role = await staffRole(ctx);
    return { name: me.name ?? "", email: me.email ?? "", isHost: isProf(role), role };
  },
});

// One row per press of Ping on #/lab, for professors and admins.
export const ping = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await requireProf(ctx);
    const me = await requireUser(ctx);
    await ctx.db.insert("pings", { user: me.tokenIdentifier, at: Date.now() });
    return null;
  },
});

// How many pings there are, counting at most 500, so after 500 the number stops changing.
// #/lab shows lastPing instead; this stays for #/lab tabs opened before lastPing existed, which
// show this number.
export const pings = query({
  args: {},
  returns: v.number(),
  handler: async (ctx) => (await ctx.db.query("pings").order("desc").take(500)).length,
});

// When the newest ping landed (Date.now() in ping, in ms), or null before the first ping. Unlike
// the count, it keeps moving after 500 pings, so two devices on #/lab still see each other's presses.
export const lastPing = query({
  args: {},
  returns: v.union(v.null(), v.number()),
  handler: async (ctx) => (await ctx.db.query("pings").order("desc").first())?.at ?? null,
});

// Asks Gemini for a set reply, for professors and admins: every call uses the app's Gemini key.
// Gemini's errors are the ConvexError lines in convex/ai.ts.
export const aiPing = action({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireProf(ctx);
    return await geminiText("Reply with exactly: the AI block works.");
  },
});
