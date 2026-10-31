import { defineConfig } from "vitest/config";

// `npm test` runs every convex/**/*.test.ts once with convex-test: each Convex function runs
// against an in-memory backend, so no test touches the dev or prod deployment. It also runs every
// src/**/*.test.ts (the screens and blocks); each of those files starts with
// `// @vitest-environment node`, since the default environment here is Convex's edge runtime. The
// setup file makes fetch throw, so no test reaches the network (convex/test.nonet.ts). Env vars
// and globals a test stubs are put back before the next test.
export default defineConfig({
  test: {
    environment: "edge-runtime",
    include: ["convex/**/*.test.ts", "src/**/*.test.ts"],
    setupFiles: ["convex/test.nonet.ts"],
    server: { deps: { inline: ["convex-test"] } },
    unstubEnvs: true,
    unstubGlobals: true,
  },
});
