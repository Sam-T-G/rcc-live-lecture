import type { AuthConfig } from "convex/server";

// Who can sign in. Convex checks every call's token against these providers. It reads this file
// when functions are pushed (`npx convex dev`, Sam's deploy), with CONVEX_CLOUD_URL set to that
// backend's URL (or its custom domain, if it has one), so each backend gets its own list.
//
// Google (Google Identity Services), on every backend: students and staff sign in with Google on
// the live site. The client is the GDG/ACM deck relay's (rcc-deck-relay), so a token from this app
// also works on the relay's backend and the other way round; change it only together with the
// relay. Its Authorized JavaScript origins must list every address this app is served from
// (README, "Google sign-in").
//
// Typed test sign-in (src/blocks/devLogin.ts), on the dev backends in DEV_HOSTS only: a name and
// email typed into the form that `npm run dev` builds show. Its signing key is public in this
// repo, so anyone can make a token for any email, and prod must never list it. The check fails
// closed, like isDevBackend in convex/checkin/prof.ts: prod (utmost-ibis-818), a custom domain, any
// other deployment and a missing CONVEX_CLOUD_URL all get Google alone. To use the typed form on
// your own dev deployment, ask Sam to add its host here and to DEV_HOSTS in convex/checkin/prof.ts
// (README step 4; he commits it), never prod's; convex/auth.config.test.ts fails when the two lists differ.
const DEV_HOSTS = ["quaint-swan-637.convex.cloud", "sample-dev-123.convex.cloud"];

// Plain string checks, no URL parsing: an address in any other form counts as prod.
const cloudUrl = (process.env.CONVEX_CLOUD_URL ?? "").trim().toLowerCase().replace(/\/$/, "");
const devBackend = DEV_HOSTS.some((host) => cloudUrl === `https://${host}`);

const google = {
  domain: "https://accounts.google.com",
  applicationID: "954308885597-kmeh8q5gajj5mh2vhnkgtgfd89e8son4.apps.googleusercontent.com",
};

const testLogin = {
  type: "customJwt",
  applicationID: "rcc-live-lecture-test",
  issuer: "https://test-login.rcc-live-lecture.local",
  jwks: "data:text/plain;charset=utf-8;base64,eyJrZXlzIjpbeyJrdHkiOiJSU0EiLCJuIjoiOERoTmJ5TnpwdEstcElzcGJVeDU4WjBvdVNFOGh2dE1xaXFuZ2xodVVDal9RbXJkVEo0aE40VldGU19kcHc3Ym5FSjdXRFotQ0Y4WElpbFdYSFlDVEZURmhjNzFDRHVqMFZnZFNGbjYyRll6eXp1UkI3cl8wX1NIeFZuQjJvS2hoYVVRZWtUTWlvblYzUDRKc3BCcm9yVzdTd2NCbDlDeExkZmpNbXlkTE1fNGt0UXZCWnI3czREZTcySm9rRTVVNXE0TWo3RmZuSVVQR1lCbGRYVkR4WHdVZUJVWklXMEhkYnJ1S0MtWkV4OVNMelU1Wk5lU2tlTXlwcTcyRkpZMFpJX2tJRHdIa1ZTTGJIOFRUbms3eXk4a3FFMUR2dW9wbXoyMThRZHd5S2xvdldPakRDMFNFWWNjWGFxOEpXSU1GX05VdExMellybUdfTUpJVzlYOU1RIiwiZSI6IkFRQUIiLCJraWQiOiJyY2MtdGVzdC0xIiwiYWxnIjoiUlMyNTYiLCJ1c2UiOiJzaWcifV19",
  algorithm: "RS256",
} as const;

export default {
  providers: devBackend ? [google, testLogin] : [google],
} satisfies AuthConfig;
