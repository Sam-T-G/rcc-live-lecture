// F39: every Convex function has a test, and every function that takes a professor key has an
// authMatrix test that calls it as each row's caller with that row's key. The functions come from
// loading each Convex module. The test files' source comes in as text through Vite, with comments
// removed, so a name in a comment doesn't count.
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

// The parameter names of the callback an authMatrix call starts with: `(as, key, t) =>`,
// `async (as, key) => {`, `as =>` or `function (as, key) {`. A parameter that isn't a plain
// name comes back as "".
function params(call: string): string[] {
  const bare = /^\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*=>/.exec(call);
  if (bare) return [bare[1]];
  const open = /^\s*(?:async\s+)?(?:function\b[^(]*)?\(/.exec(call);
  if (!open) return [];
  const start = open[0].length;
  return call
    .slice(start, skipCode(call, start, ")") - 1)
    .split(",")
    .map((p) => /^\s*([A-Za-z_$][\w$]*)\s*(?:[:=?]|$)/.exec(p)?.[1] ?? "");
}

// Whether a call's arguments set `key` to the parameter named `key`: `{ key }` when the parameter
// is called key, or `{ key: k }`.
function passesKey(args: string, key: string): boolean {
  const k = key.replace(/\$/g, "\\$");
  return new RegExp(`[{,]\\s*key\\s*:\\s*${k}\\s*[,}]`).test(args) || (key === "key" && /[{,]\s*key\s*[,}]/.test(args));
}

// The one function an authMatrix call checks, or null. The callback has to call exactly one
// function through its first parameter (the row's caller), and pass its second parameter (the
// row's key) as `key` every time. A setup step on `t` or with PROF_KEY runs the same way on every
// row, so it checks nothing. A second function called through the row's caller could throw first
// on a refused row, so the matrix would never find out whether the function after it refuses.
function matrixCheck(call: string): string | null {
  const [as, key] = params(call);
  if (!as || !key) return null;
  const through = new RegExp(`(?<![\\w$.])${as.replace(/\$/g, "\\$")}\\s*\\.\\s*(?:query|mutation|action)\\s*\\(`, "g");
  const calls = [...call.matchAll(through)].map((m) => {
    const start = m.index + m[0].length;
    return call.slice(start, skipCode(call, start, ")") - 1);
  });
  const refs = new Set(calls.map((args) => /^\s*((?:api|internal)(?:\.[\w$]+)+)\s*,/.exec(args)?.[1] ?? ""));
  const [ref] = refs;
  return refs.size === 1 && ref && calls.every((args) => passesKey(args, key)) ? ref : null;
}

describe("F39 every Convex function is tested", async () => {
  const fns = await convexFunctions();
  const tests = Object.values(SOURCES).map(withoutComments);
  const all = tests.join("\n");
  const matrices = tests.flatMap(authMatrixCalls);

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

  it("F39.3 every function with a key arg, except checkin.pass.amHost, is the one function an authMatrix call checks", () => {
    const checked = new Set(matrices.map(matrixCheck));
    const keyed = fns.filter((f) => f.hasKey && !NO_MATRIX.includes(f.ref));
    expect(keyed.filter((f) => !checked.has(f.ref)).map((f) => f.ref)).toEqual([]);
  });

  it("F39.3 a function counts only when the matrix calls it, and nothing else, as the row's caller with the row's key", () => {
    const check = (src: string) => authMatrixCalls(withoutComments(src)).map(matrixCheck);
    // The shapes checkin/prof.test.ts uses.
    expect(check(`authMatrix((as, key) => as.query(api.a.names, { key, channel: CH }))`)).toEqual(["api.a.names"]);
    expect(check(`authMatrix(async (as, key) => { if (!(await as.query(api.a.canScan, { key }))) throw new Error("no"); })`)).toEqual(["api.a.canScan"]);
    expect(
      check(`authMatrix(async (as, key, t) => {
        const poll = await t.mutation(api.setup.ask, { key: PROF_KEY, channel: CH });
        await as.mutation(api.a.end, { key, poll });
      })`),
    ).toEqual(["api.a.end"]);
    expect(check(`authMatrix(async function (who, k) { await who.mutation(api.a.end, { poll, key: k }); })`)).toEqual(["api.a.end"]);
    // Used only as a setup step, on `t` or as the row's caller with PROF_KEY: not checked.
    expect(check(`authMatrix(async (as, key, t) => { await t.mutation(api.setup.ask, { key: PROF_KEY }); })`)).toEqual([null]);
    expect(check(`authMatrix(async (as, key) => { await as.mutation(api.setup.ask, { key: PROF_KEY }); })`)).toEqual([null]);
    // Called without the row's key: not checked.
    expect(check(`authMatrix((as, k) => as.query(api.a.names, { key }))`)).toEqual([null]);
    expect(check(`authMatrix((as, key) => as.query(api.a.names, { channel: key }))`)).toEqual([null]);
    expect(check(`authMatrix((as) => as.query(api.a.names, {}))`)).toEqual([null]);
    // Two functions called as the row's caller: answer throws first on a refused row, so share is never tried there.
    expect(
      check(`authMatrix(async (as, key) => {
        await as.mutation(api.a.answer, { key, id });
        await as.mutation(api.a.share, { key, id });
      })`),
    ).toEqual([null]);
    // A function passed by name: no callback to read.
    expect(check(`authMatrix(tryNames)`)).toEqual([null]);
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
    expect(matrixCheck(calls[0])).toBe("api.checkin.quiz.end");
    expect(names(calls[0], "api.outside.theCall")).toBe(false);
    expect(names(src, "api.outside.theCall")).toBe(true);
    expect(names(src, "api.only.inAComment")).toBe(false);
    expect(names(src, "api.block.comment")).toBe(false);
    expect(names("api.checkin.quiz.endDay", "api.checkin.quiz.end")).toBe(false);
  });
});
