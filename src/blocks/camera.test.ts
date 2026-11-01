// @vitest-environment node
// F44: student phones never download MediaPipe (@mediapipe/tasks-vision). Vite puts every module
// that src/main.tsx reaches through static imports into the main bundle, which every page loads,
// and gives a module reached only through import() its own file, loaded when that line runs. So
// this walks the static imports from src/main.tsx and fails if @mediapipe/tasks-vision is on the
// path, printing the chain of files that pulls it in.
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const VISION = "@mediapipe/tasks-vision";

// `import x from "y"`, `import "y"`, `export { x } from "y"`, at the start of a line. `import type`
// and `export type` are left out (TypeScript deletes them), and so is import("y").
const STATIC_IMPORT = /^[ \t]*(?:import|export)\s+(?!type\s)(?:[^;]*?\sfrom\s+)?["']([^"']+)["']/gm;

const rel = (file: string) => relative(ROOT, file);

function resolveImport(from: string, spec: string) {
  for (const ext of ["", ".ts", ".tsx", ".js", ".d.ts", "/index.ts", "/index.tsx"]) {
    const file = join(dirname(from), spec + ext);
    if (existsSync(file) && statSync(file).isFile()) return file;
  }
  throw new Error(`${rel(from)} imports ${spec}, and no file matches it`);
}

// Every file and package `entry` reaches through static imports, each with the chain that got there.
function staticReach(entry: string) {
  const chains = new Map<string, string[]>();
  const queue: [string, string[]][] = [[join(ROOT, entry), [entry]]];
  while (queue.length > 0) {
    const [file, chain] = queue.shift()!;
    if (chains.has(rel(file))) continue;
    chains.set(rel(file), chain);
    for (const [, spec] of readFileSync(file, "utf8").matchAll(STATIC_IMPORT)) {
      if (!spec.startsWith(".")) {
        if (!chains.has(spec)) chains.set(spec, [...chain, spec]);
        continue;
      }
      const next = resolveImport(file, spec);
      if (/\.(tsx?|js)$/.test(next)) queue.push([next, [...chain, rel(next)]]);
    }
  }
  return chains;
}

describe("F44: phones stop downloading @mediapipe/tasks-vision", () => {
  it("only the LabVision chunk has it: no static import from src/main.tsx reaches it, and #/lab Vision still loads it through import()", () => {
    const main = staticReach("src/main.tsx");
    expect(main.has("src/teams/checkin/Page.tsx")).toBe(true); // the walk reached the pages
    expect(main.get(VISION)?.join(" > ") ?? "not reached").toBe("not reached");
    // #/lab Vision: Lab.tsx loads LabVision.tsx with import() (through retryLazy, a React.lazy that
    // can load again after a failed import), and LabVision.tsx imports vision.ts.
    expect(readFileSync(join(ROOT, "src/pages/Lab.tsx"), "utf8")).toMatch(/retryLazy\(\(\) => import\("\.\/LabVision"\)\)/);
    expect(main.has("src/pages/LabVision.tsx")).toBe(false);
    expect(staticReach("src/pages/LabVision.tsx").get(VISION)).toEqual(["src/pages/LabVision.tsx", "src/blocks/vision.ts", VISION]);
  });

  // sweep1-checkin-8: jsQR (130 kB) reads passes only on #/checkin/teacher and #/checkin/kiosk, in
  // browsers without a QR BarcodeDetector, so qrRead.ts loads it with import() when it first needs it.
  it("sweep1-checkin-8 no static import from src/main.tsx reaches jsqr; qrRead.ts loads it with import()", () => {
    const main = staticReach("src/main.tsx");
    expect(main.has("src/teams/checkin/qrRead.ts")).toBe(true);
    expect(main.get("jsqr")?.join(" > ") ?? "not reached").toBe("not reached");
    expect(readFileSync(join(ROOT, "src/teams/checkin/qrRead.ts"), "utf8")).toMatch(/await import\("jsqr"\)/);
  });

  it("Start scanning (#/checkin/teacher) and Start check-in (#/checkin/kiosk) get useCamera from blocks/camera, which imports only react", () => {
    expect([...staticReach("src/blocks/camera.ts").keys()]).toEqual(["src/blocks/camera.ts", "react"]);
    for (const page of ["src/teams/checkin/Teacher.tsx", "src/teams/checkin/Kiosk.tsx"]) {
      const reach = staticReach(page);
      expect(reach.has("src/blocks/camera.ts")).toBe(true);
      expect(reach.has("src/blocks/vision.ts")).toBe(false);
    }
  });
});
