import { AuthConfig } from "convex/server";

// Students and hosts sign in with Google (Google Identity Services). The browser gets a
// Google ID token and hands it to Convex, which checks it against Google's keys.
// The client is the GDG/ACM deck relay's; its Authorized JavaScript origins must list
// every address this app is served from (README, "Google sign-in").
export default {
  providers: [
    {
      domain: "https://accounts.google.com",
      applicationID:
        "954308885597-kmeh8q5gajj5mh2vhnkgtgfd89e8son4.apps.googleusercontent.com",
    },
  ],
} satisfies AuthConfig;
