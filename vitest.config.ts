import { defineConfig } from "vitest/config";
import type { Reporter, Vitest } from "vitest/node";

// `npm test` runs two sets of tests once:
// - "convex": every convex/**/*.test.ts with convex-test, in Convex's edge runtime. Each Convex
//   function runs against an in-memory backend, so no test touches the dev or prod deployment.
// - "src": every src/**/*.test.ts (the screens, blocks and styles) in Node, since they need no
//   browser. Those files also start with `// @vitest-environment node`, which says the same thing.
// The setup file makes fetch throw, so no test reaches the network (convex/test.nonet.ts). Env
// vars and globals a test stubs are put back before the next test.
//
// vitest exits 0 when a project's include finds no files, so a config edit that drops the "src"
// project or breaks its glob would let every src test stop running with the gate still green.
// everyProjectRuns() fails the run (exit code 1) when either project is missing or its include
// finds no test files on disk. A run filtered with --project checks only the projects it runs.
const PROJECTS = ["convex", "src"];

function everyProjectRuns(): Reporter {
  let vitest: Vitest | undefined;
  return {
    onInit(v) {
      vitest = v;
    },
    async onTestRunEnd() {
      if (!vitest) return;
      const problems: string[] = [];
      const running = vitest.projects.map((p) => p.name);
      if (!vitest.config.project?.length) {
        for (const name of PROJECTS) if (!running.includes(name)) problems.push(`there is no "${name}" test project`);
      }
      for (const project of vitest.projects) {
        const { testFiles } = await project.globTestFiles();
        if (testFiles.length === 0) problems.push(`the "${project.name}" project's include finds no test files`);
      }
      if (problems.length === 0) return;
      vitest.logger.error(`\nvitest.config.ts: ${problems.join("; ")}. Failing the run.`);
      process.exitCode = 1;
    },
  };
}

export default defineConfig({
  test: {
    reporters: ["default", everyProjectRuns()],
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
