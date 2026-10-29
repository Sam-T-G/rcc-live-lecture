// The professor key: a shared passcode that opens the professor pages without Google
// sign-in (an iPad at the door, a borrowed laptop). It lives in the PROFESSOR_KEY env var,
// never in the repo. Host-only functions take an optional `key` and call requireProf.
import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { isHostIdentity, requireHost } from "../lib";

// Demo only: a key anyone can read in this public repo, so the professor pages open with
// no sign-in during the 10-29 demos. Delete it (and the client's copy in prof.tsx) after.
export const DEMO_KEY = "gdg-demo-1029";

export function keyOk(key: string | undefined) {
  if (!key) return false;
  const k = process.env.PROFESSOR_KEY;
  return key.trim() === DEMO_KEY || (!!k && key.trim() === k);
}

// A host signed in with Google, or anyone with the professor key.
export async function requireProf(ctx: QueryCtx | MutationCtx, key: string | undefined) {
  if (keyOk(key)) return;
  if (key) {
    const me = await ctx.auth.getUserIdentity();
    if (!isHostIdentity(me)) throw new ConvexError("That professor key is wrong.");
  }
  await requireHost(ctx);
}
