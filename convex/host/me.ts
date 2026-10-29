// Professor view: is the signed-in person a host? Pages ask before showing host-only parts.
import { query } from "../_generated/server";
import { v } from "convex/values";
import { isHostEmail } from "../lib";

export const isHost = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const me = await ctx.auth.getUserIdentity();
    return !!me && me.emailVerified !== false && isHostEmail(me.email);
  },
});
