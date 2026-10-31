import { defineConfig } from "vitest/config";

// `npm test` runs two sets of tests once:
// - "convex": every convex/**/*.test.ts with convex-test, in Convex's edge runtime. Each Convex
//   function runs against an in-memory backend, so no test touches the dev or prod deployment.
// - "src": every src/**/*.test.ts (the screens, blocks and styles) in Node, since they need no
//   browser. Those files also start with `// @vitest-environment node`, which says the same thing.
// The setup file makes fetch throw, so no test reaches the network (convex/test.nonet.ts). Env
// vars and globals a test stubs are put back before the next test.
export default defineConfig({
  test: {
    setupFiles: ["convex/test.nonet.ts"],
    unstubEnvs: true,
    unstubGlobals: true,
    projects: [
      {
        extends: true,
        test: {
          name: "convex",
          environment: "edge-runtime",
          include: ["convex/**/*.test.ts"],
          server: { deps: { inline: ["convex-test"] } },
        },
      },
      {
        extends: true,
        test: { name: "src", environment: "node", include: ["src/**/*.test.ts"] },
      },
    ],
  },
});
