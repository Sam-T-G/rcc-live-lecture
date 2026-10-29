// The professor key: a shared passcode that opens the professor pages without Google
// sign-in (an iPad at the door, a borrowed laptop). It lives in the PROFESSOR_KEY env var,
// never in the repo. Host-only functions take an optional `key` and call requireProf.
import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { isHostEmail, requireHost } from "../lib";

export function keyOk(key: string | undefined) {
  const k = process.env.PROFESSOR_KEY;
  return !!k && !!key && key.trim() === k;
}

// A host signed in with Google, or anyone with the professor key.
export async function requireProf(ctx: QueryCtx | MutationCtx, key: string | undefined) {
  if (keyOk(key)) return;
  if (key) {
    const me = await ctx.auth.getUserIdentity();
    if (!me || !isHostEmail(me.email)) throw new ConvexError("That professor key is wrong.");
  }
  await requireHost(ctx);
}
