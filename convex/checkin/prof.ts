// Who can open the professor pages: a Google account on HOST_EMAILS, or anyone with the professor
// key (a passcode for a professor who doesn't sign in with Google). The key's value is set only in
// the PROFESSOR_KEY env var, never in the repo. Every host-only function takes `key:
// v.optional(v.string())` and calls requireProf(ctx, key) first.
// The kiosk key (KIOSK_KEY env var) is a second passcode for the iPad at the door: it opens the
// pass scanner (checkin.pass.scan and canScan) and nothing else.
import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { isHostIdentity, requireHost } from "../lib";

// True only when PROFESSOR_KEY is set and the key matches it. Spaces around a typed key are ignored.
export function keyOk(key: string | undefined) {
  const k = process.env.PROFESSOR_KEY;
  return !!key && !!k && key.trim() === k;
}

// True only when KIOSK_KEY is set, at least 16 characters long, and the key matches it.
export function kioskKeyOk(key: string | undefined) {
  const k = process.env.KIOSK_KEY;
  return !!key && !!k && k.length >= 16 && key.trim() === k;
}

// A host signed in with Google, or anyone with the professor key. The kiosk key never passes.
export async function requireProf(ctx: QueryCtx | MutationCtx, key: string | undefined) {
  if (keyOk(key)) return;
  if (key) {
    const me = await ctx.auth.getUserIdentity();
    if (!isHostIdentity(me)) throw new ConvexError("That professor key is wrong.");
  }
  await requireHost(ctx);
}

// The pass scanner at the door: the kiosk key, the professor key, or a Google host.
export async function requireScanner(ctx: QueryCtx | MutationCtx, key: string | undefined) {
  if (kioskKeyOk(key)) return;
  await requireProf(ctx, key);
}
