// F39: every Convex function has a test, and every function that takes a professor key has an
// authMatrix test. The functions come from loading each Convex module. The test files' source
// comes in as text through Vite, with comments removed, so a name in a comment doesn't count.
import { describe, expect, it } from "vitest";
import { modules } from "./test.setup";

const SOURCES = import.meta.glob<string>(["./**/*.test.ts", "!./coverage.test.ts"], { query: "?raw", import: "default", eager: true });
// convex/host/ is left out until UZ deletes it (and this skip with it).
const SKIP_MODULES = ["host/"];
// amHost answers true or false for any caller, so it has no refused row to check.
const NO_MATRIX = ["api.checkin.pass.amHost"];

type Fn = { ref: string; hasKey: boolean };
type Registered = { isQuery?: boolean; isMutation?: boolean; isAction?: boolean; isInternal?: boolean; exportArgs?: () => string };

// Every query, mutation and action a Convex module exports, as `api.<module>.<name>` or
// `internal.<module>.<name>`, and whether its args include `key`.
async function convexFunctions(): Promise<Fn[]> {
  const out: Fn[] = [];
  for (const [file, load] of Object.entries(modules)) {
    const mod = file.replace(/^\.\//, "").replace(/\.[cm]?[jt]s$/, "");
    if (mod.startsWith("_generated/") || SKIP_MODULES.some((s) => mod.startsWith(s))) continue;
    for (const [name, value] of Object.entries((await load()) as Record<string, unknown>)) {
      const f = value as Registered;
      if (typeof value !== "function" || !(f.isQuery || f.isMutation || f.isAction)) continue;
      const args = JSON.parse(f.exportArgs?.() ?? "{}") as { type?: string; value?: Record<string, unknown> };
      out.push({
        ref: `${f.isInternal ? "internal" : "api"}.${mod.split("/").join(".")}.${name}`,
        hasKey: args.type === "object" && !!args.value && "key" in args.value,
      });
    }
  }
  return out.sort((a, b) => a.ref.localeCompare(b.ref));
}

// Every route on the HTTP router, as [path, method].
async function httpRoutes(): Promise<[string, string][]> {
  const http = (await modules["./http.ts"]()) as { default: { getRoutes(): readonly (readonly [string, string, unknown])[] } };
  return http.default.getRoutes().map(([path, method]) => [path, method]);
}

// Reads the string, template or comment that starts at `i` and returns the index just past it, or
// -1 when none starts there. A template literal is read with its ${...} parts.
function skipLiteral(src: string, i: number): number {
  const c = src[i];
  if (c === "/" && src[i + 1] === "/") {
    const end = src.indexOf("\n", i);
    return end === -1 ? src.length : end;
  }
  if (c === "/" && src[i + 1] === "*") {
    const end = src.indexOf("*/", i + 2);
    return end === -1 ? src.length : end + 2;
  }
  if (c === '"' || c === "'") {
    let j = i + 1;
    while (j < src.length && src[j] !== c) j += src[j] === "\\" ? 2 : 1;
    return j + 1;
  }
  if (c === "`") {
    let j = i + 1;
    while (j < src.length && src[j] !== "`") {
      if (src[j] === "\\") j += 2;
      else if (src[j] === "$" && src[j + 1] === "{") j = skipCode(src, j + 2, "}");
      else j++;
    }
    return j + 1;
  }
  return -1;
}

// Reads code from `i` up to the `close` bracket that ends it and returns the index just past it.
function skipCode(src: string, i: number, close: ")" | "}"): number {
  const open = close === "}" ? "{" : "(";
  let depth = 1;
  while (i < src.length) {
    const past = skipLiteral(src, i);
    if (past !== -1) {
      i = past;
      continue;
    }
    if (src[i] === open) depth++;
    else if (src[i] === close && --depth === 0) return i + 1;
    i++;
  }
  return i;
}

// The source with every comment blanked out; strings and templates stay.
function withoutComments(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const past = skipLiteral(src, i);
    if (past === -1) {
      out += src[i++];
      continue;
    }
    const chunk = src.slice(i, past);
    out += chunk.startsWith("//") || chunk.startsWith("/*") ? chunk.replace(/[^\n]/g, " ") : chunk;
    i = past;
  }
  return out;
}

// The text inside the parentheses of every authMatrix(...) call.
function authMatrixCalls(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/(?<![\w$.])authMatrix\s*\(/g)) {
    const start = m.index + m[0].length;
    out.push(src.slice(start, skipCode(src, start, ")") - 1));
  }
  return out;
}

// Whether `text` names `ref` as a whole name: api.checkin.quiz.end, never api.checkin.quiz.endDay.
const names = (text: string, ref: string) => new RegExp(`(?<![\\w$.])${ref.replace(/\./g, "\\.")}(?![\\w$])`).test(text);

describe("F39 every Convex function is tested", async () => {
  const fns = await convexFunctions();
  const tests = Object.values(SOURCES).map(withoutComments);
  const all = tests.join("\n");
  const matrices = tests.flatMap(authMatrixCalls).join("\n");

  it("finds the functions and the test files to check", () => {
    expect(fns.length).toBeGreaterThan(0);
    expect(fns.some((f) => f.ref.startsWith("internal."))).toBe(true);
    expect(fns.some((f) => f.hasKey)).toBe(true);
    expect(tests.length).toBeGreaterThan(0);
  });

  it("F39.2 every exported function outside convex/host/ is named in a test", () => {
    expect(fns.filter((f) => !names(all, f.ref)).map((f) => f.ref)).toEqual([]);
  });

  it("F39.2 every HTTP route is called with its method in a test", async () => {
    const untested = (await httpRoutes()).filter(([path, method]) => {
      const call = new RegExp(`\\.fetch\\(\\s*(["'\`])${path}\\1\\s*,\\s*\\{[^}]*method:\\s*["']${method}["']`);
      return !call.test(all);
    });
    expect(untested).toEqual([]);
  });

  it("F39.3 every function with a key arg, except checkin.pass.amHost, is named in an authMatrix call", () => {
    const keyed = fns.filter((f) => f.hasKey && !NO_MATRIX.includes(f.ref));
    expect(keyed.filter((f) => !names(matrices, f.ref)).map((f) => f.ref)).toEqual([]);
  });

  it("F39.3 the scan reads authMatrix calls, strings and comments the way a test file has them", () => {
    const src = withoutComments(`
      // authMatrix(as => as.query(api.only.inAComment, {}))
      await authMatrix(async (as, key) => {
        const label = "a ) inside a string";
        await as.mutation(api.checkin.quiz.end, { key, poll: \`\${(1 + 2)}\` });
      });
      as.query(api.outside.theCall, {});
      /* api.block.comment */`);
    const calls = authMatrixCalls(src);
    expect(calls).toHaveLength(1);
    expect(names(calls[0], "api.checkin.quiz.end")).toBe(true);
    expect(names(calls[0], "api.outside.theCall")).toBe(false);
    expect(names(src, "api.outside.theCall")).toBe(true);
    expect(names(src, "api.only.inAComment")).toBe(false);
    expect(names(src, "api.block.comment")).toBe(false);
    expect(names("api.checkin.quiz.endDay", "api.checkin.quiz.end")).toBe(false);
  });
});
