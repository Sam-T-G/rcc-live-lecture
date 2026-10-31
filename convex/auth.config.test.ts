// convex/auth.config.ts (D1): the typed test sign-in's signing key is public in this repo, so a
// backend that accepts typed tokens lets anyone sign in as any email. Prod and any backend the
// file can't name as dev accept Google alone; the dev backends in DEV_HOSTS add the typed sign-in
// for browser checks. Convex reads the file once per push with that backend's CONVEX_CLOUD_URL,
// so each case loads it afresh under a stubbed URL.
import { describe, expect, it, vi } from "vitest";
import AUTH_CONFIG_SOURCE from "./auth.config.ts?raw";
import PROF_SOURCE from "./checkin/prof.ts?raw";
import { isDevBackend } from "./checkin/prof";
import { DEV_URL, PROD_URL } from "./test.helpers";

const GOOGLE = "https://accounts.google.com";
const TYPED = "https://test-login.rcc-live-lecture.local";
const CLIENT_ID = "954308885597-kmeh8q5gajj5mh2vhnkgtgfd89e8son4.apps.googleusercontent.com";
// This laptop's dev deployment (AGENTS.md).
const LAPTOP_DEV_URL = "https://quaint-swan-637.convex.cloud";

// The providers a backend with this CONVEX_CLOUD_URL gets (undefined: the variable isn't set),
// by issuer, and Google's application ID.
async function providersOn(url: string | undefined) {
  vi.stubEnv("CONVEX_CLOUD_URL", url);
  vi.resetModules();
  const { providers } = (await import("./auth.config")).default;
  const google = providers.find((p) => "domain" in p && p.domain === GOOGLE);
  return { issuers: providers.map((p) => ("domain" in p ? p.domain : p.issuer)), googleApp: google?.applicationID };
}

// The hosts in a `const DEV_HOSTS = [...]` line of a source file.
function devHostsIn(source: string): string[] {
  const list = /const DEV_HOSTS = \[([^\]]*)\]/.exec(source)?.[1] ?? "";
  return [...list.matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort();
}

// URLs no dev deployment answers on: prod, prod in other spellings, a custom canonical domain, a
// new deployment, a URL that names a dev deployment in the wrong place, http, and no URL at all.
const NOT_DEV = [
  PROD_URL,
  PROD_URL.toUpperCase(),
  `${PROD_URL}/`,
  "https://api.example.com",
  "https://brave-otter-123.convex.cloud",
  "https://quaint-swan-637.example.com",
  "https://quaint-swan-637.convex.cloud.example.com",
  "https://example.com/quaint-swan-637.convex.cloud",
  "https://api.example.com/?quaint-swan-637",
  "http://quaint-swan-637.convex.cloud",
  "quaint-swan-637.convex.cloud",
  "not a url",
  "",
  undefined,
];

describe("D1 convex/auth.config.ts: the typed test sign-in is accepted on dev backends alone", () => {
  it("D1 prod (utmost-ibis-818) lists Google alone, and a dev backend in DEV_HOSTS adds the typed test sign-in", async () => {
    expect(await providersOn(PROD_URL)).toEqual({ issuers: [GOOGLE], googleApp: CLIENT_ID });
    for (const url of [LAPTOP_DEV_URL, DEV_URL, LAPTOP_DEV_URL.toUpperCase(), `${LAPTOP_DEV_URL}/`, ` ${LAPTOP_DEV_URL} `])
      expect([url, await providersOn(url)]).toEqual([url, { issuers: [GOOGLE, TYPED], googleApp: CLIENT_ID }]);
  });

  it("D1 a backend the file can't name as dev lists Google alone: no URL, a custom domain, another deployment, a lookalike", async () => {
    for (const url of NOT_DEV) expect([url, (await providersOn(url)).issuers]).toEqual([url, [GOOGLE]]);
  });

  it("D1 auth.config.ts and checkin/prof.ts name the same dev backends, so a typed sign-in that signs in on one can hold a test role", async () => {
    const hosts = devHostsIn(AUTH_CONFIG_SOURCE);
    expect(hosts).toEqual(devHostsIn(PROF_SOURCE));
    expect(hosts.length).toBeGreaterThan(0);
    for (const host of hosts) {
      const url = `https://${host}`;
      expect([url, (await providersOn(url)).issuers]).toEqual([url, [GOOGLE, TYPED]]);
      expect([url, isDevBackend()]).toEqual([url, true]);
    }
    // Never more open than the role check: wherever prof.ts says prod, so does auth.config.ts.
    for (const url of NOT_DEV) {
      const { issuers } = await providersOn(url);
      expect([url, isDevBackend(), issuers]).toEqual([url, false, [GOOGLE]]);
    }
  });
});
