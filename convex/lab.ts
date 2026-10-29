// Block: lab. Small functions the /lab page calls to prove each block works end to end.
// Safe to leave in; nothing product-facing depends on them.
import { v } from "convex/values";
import { query, mutation, action } from "./_generated/server";
import { requireUser, isHostIdentity } from "./lib";
import { geminiText } from "./ai";

export const whoami = query({
  args: {},
  returns: v.union(v.null(), v.object({ name: v.string(), email: v.string(), isHost: v.boolean() })),
  handler: async (ctx) => {
    const me = await ctx.auth.getUserIdentity();
    if (!me) return null;
    return { name: me.name ?? "", email: me.email ?? "", isHost: isHostIdentity(me) };
  },
});

export const ping = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    await ctx.db.insert("pings", { user: me.tokenIdentifier, at: Date.now() });
    return null;
  },
});

export const pings = query({
  args: {},
  returns: v.number(),
  handler: async (ctx) => (await ctx.db.query("pings").order("desc").take(500)).length,
});

export const aiPing = action({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    if (!(await ctx.auth.getUserIdentity())) throw new Error("Sign in first.");
    return await geminiText("Reply with exactly: the AI block works.");
  },
});
