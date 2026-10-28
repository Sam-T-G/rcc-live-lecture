// Helpers every server function can use. BLOCKS.md says when to reach for each.
import { ConvexError } from "convex/values";
import type { QueryCtx, MutationCtx } from "./_generated/server";

type Ctx = QueryCtx | MutationCtx;

// The signed-in Google account, or an error. Use identity.tokenIdentifier as the user key.
export async function requireUser(ctx: Ctx) {
  const me = await ctx.auth.getUserIdentity();
  if (!me) throw new ConvexError("Sign in with Google first.");
  return me;
}

// Hosts (professors, officers) are the Google accounts in the HOST_EMAILS env var,
// comma-separated: `npx convex env set HOST_EMAILS "a@x.com,b@y.com"`. Never in the repo.
export function isHostEmail(email: string | undefined) {
  if (!email) return false;
  const list = (process.env.HOST_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

export async function requireHost(ctx: Ctx) {
  const me = await requireUser(ctx);
  if (!isHostEmail(me.email) || me.emailVerified === false)
    throw new ConvexError("Only hosts can do that.");
  return me;
}

// Random string from an alphabet. Works in queries, mutations, and actions.
// For codes people read aloud, leave out look-alikes: "ABCDEFGHJKLMNPQRSTUVWXYZ".
export function randomCode(len: number, alphabet = "abcdefghijklmnopqrstuvwxyz0123456789") {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

// Distance in meters between two points (haversine). Indoor phone GPS is often off by
// 20 to 100 m, so compare against a radius plus the phone's reported accuracy.
export function metersBetween(aLat: number, aLng: number, bLat: number, bLng: number) {
  const r = 6371000;
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}
