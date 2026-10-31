import { defineConfig } from "vitest/config";

// `npm test` runs every convex/**/*.test.ts once with convex-test: each Convex function runs
// against an in-memory backend, so no test touches the dev or prod deployment. The setup file
// makes fetch throw, so no test reaches the network (convex/test.nonet.ts). Env vars and
// globals a test stubs are put back before the next test.
export default defineConfig({
  test: {
    environment: "edge-runtime",
    include: ["convex/**/*.test.ts"],
    setupFiles: ["convex/test.nonet.ts"],
    server: { deps: { inline: ["convex-test"] } },
    unstubEnvs: true,
    unstubGlobals: true,
  },
});
