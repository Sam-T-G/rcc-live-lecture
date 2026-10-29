import { AuthConfig } from "convex/server";

// Students and hosts sign in with Google (Google Identity Services). The browser gets a
// Google ID token and hands it to Convex, which checks it against Google's keys.
// The client is the GDG/ACM deck relay's; its Authorized JavaScript origins must list
// every address this app is served from (README, "Google sign-in").
//
// Test sign-in (src/blocks/devLogin.ts): type any name and email on `npm run dev`. Its
// signing key is public in this repo, so Convex accepts it only on dev backends. Prod
// (utmost-ibis-818) never lists it, and neither does a deployment whose URL it can't read.
const url = process.env.CONVEX_CLOUD_URL ?? "";
const devBackend = url !== "" && !url.includes("utmost-ibis-818");

const testLogin = {
  type: "customJwt",
  applicationID: "rcc-live-lecture-test",
  issuer: "https://test-login.rcc-live-lecture.local",
  jwks: "data:text/plain;charset=utf-8;base64,eyJrZXlzIjpbeyJrdHkiOiJSU0EiLCJuIjoiOERoTmJ5TnpwdEstcElzcGJVeDU4WjBvdVNFOGh2dE1xaXFuZ2xodVVDal9RbXJkVEo0aE40VldGU19kcHc3Ym5FSjdXRFotQ0Y4WElpbFdYSFlDVEZURmhjNzFDRHVqMFZnZFNGbjYyRll6eXp1UkI3cl8wX1NIeFZuQjJvS2hoYVVRZWtUTWlvblYzUDRKc3BCcm9yVzdTd2NCbDlDeExkZmpNbXlkTE1fNGt0UXZCWnI3czREZTcySm9rRTVVNXE0TWo3RmZuSVVQR1lCbGRYVkR4WHdVZUJVWklXMEhkYnJ1S0MtWkV4OVNMelU1Wk5lU2tlTXlwcTcyRkpZMFpJX2tJRHdIa1ZTTGJIOFRUbms3eXk4a3FFMUR2dW9wbXoyMThRZHd5S2xvdldPakRDMFNFWWNjWGFxOEpXSU1GX05VdExMellybUdfTUpJVzlYOU1RIiwiZSI6IkFRQUIiLCJraWQiOiJyY2MtdGVzdC0xIiwiYWxnIjoiUlMyNTYiLCJ1c2UiOiJzaWcifV19",
  algorithm: "RS256",
} as const;

export default {
  providers: [
    {
      domain: "https://accounts.google.com",
      applicationID:
        "954308885597-kmeh8q5gajj5mh2vhnkgtgfd89e8son4.apps.googleusercontent.com",
    },
    ...(devBackend ? [testLogin] : []),
  ],
} satisfies AuthConfig;
