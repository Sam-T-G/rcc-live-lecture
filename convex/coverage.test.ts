// F39: every Convex function has a test, every function that takes a professor key has an
// authMatrix test that calls it as each row's caller with that row's key, and every Convex test
// runs. The functions come from loading each Convex module. The test files' source comes in as
// text through Vite and is read with comments removed, so a name in a comment doesn't count.
import { describe, expect, it } from "vitest";
import SELF from "./coverage.test.ts?raw";
import { modules } from "./test.setup";

// Every other convex/**/*.test.ts as text: Vite's glob leaves out the file that calls it. Their
// names count; this file's own examples don't.
const SOURCES = import.meta.glob<string>("./**/*.test.ts", { query: "?raw", import: "default", eager: true });
// Every Convex test file, this one included, for the skip check.
const ALL_SOURCES: Record<string, string> = { ...SOURCES, "./coverage.test.ts": SELF };
// convex/host/ is left out until UZ deletes it (and this skip with it).
const SKIP_MODULES = ["host/"];
// amHost answers true or false for any caller, so it has no refused row to check.
const NO_MATRIX = ["api.checkin.pass.amHost"];
// The door scanner's functions, the only ones an authMatrix call may check against SCANNER (the
// kiosk key gets through). Every other function with a key arg is checked against HOST_ONLY.
const DOOR = ["api.checkin.pass.scan", "api.checkin.pass.canScan"];

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

// Words after which a `/` starts a regex instead of dividing.
const BEFORE_REGEX = ["return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw", "case", "do", "else", "await", "yield"];

// Whether the `/` at `i` starts a regex: at the start of the source, after an operator, an
// opening bracket, a comma, a semicolon, a brace or a word such as return. After a name, a
// number, `)` or `]` it divides.
function regexAt(src: string, i: number): boolean {
  let j = i - 1;
  while (j >= 0 && /\s/.test(src[j])) j--;
  if (j < 0 || "(,=:[!&|?{}~^%*+-<>;".includes(src[j])) return true;
  let k = j;
  while (k >= 0 && /[\w$]/.test(src[k])) k--;
  return BEFORE_REGEX.includes(src.slice(k + 1, j + 1));
}

// Reads the string, template, regex or comment that starts at `i` and returns the index just
// past it, or -1 when none starts there. A template literal is read with its ${...} parts.
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
  if (c === "/" && regexAt(src, i)) {
    // A regex ends at the first `/` outside a [...] class, on the same line. Its flags follow.
    let inClass = false;
    for (let j = i + 1; j < src.length && src[j] !== "\n"; j++) {
      if (src[j] === "\\") j++;
      else if (src[j] === "[") inClass = true;
      else if (src[j] === "]") inClass = false;
      else if (src[j] === "/" && !inClass) {
        let end = j + 1;
        while (end < src.length && /[a-z]/i.test(src[end])) end++;
        return end;
      }
    }
    return -1; // No closing `/` on the line, so it was a division after all.
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

// The source with every comment turned into spaces, and with `literals` every string, template
// and regex too. Line breaks stay, so line numbers still match.
function blank(src: string, literals: boolean): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const past = skipLiteral(src, i);
    if (past === -1) {
      out += src[i++];
      continue;
    }
    const chunk = src.slice(i, past);
    out += literals || chunk.startsWith("//") || chunk.startsWith("/*") ? chunk.replace(/[^\n]/g, " ") : chunk;
    i = past;
  }
  return out;
}

// The source without its comments. Strings, templates and regexes stay.
const withoutComments = (src: string) => blank(src, false);
// Only the code: no comments, strings, templates or regexes.
const codeOnly = (src: string) => blank(src, true);

type MatrixCall = { awaited: boolean; args: string };

// Every authMatrix(...) call: the text inside its parentheses, and whether `await` comes right
// before it.
function authMatrixCalls(src: string): MatrixCall[] {
  return [...src.matchAll(/(?<![\w$.])authMatrix\s*\(/g)].map((m) => {
    const start = m.index + m[0].length;
    return { awaited: /(?<![\w$.])await\s+$/.test(src.slice(0, m.index)), args: src.slice(start, skipCode(src, start, ")") - 1) };
  });
}

// Whether `text` names `ref` as a whole name: api.checkin.quiz.end, never api.checkin.quiz.endDay.
const names = (text: string, ref: string) => new RegExp(`(?<![\\w$.])${ref.replace(/\./g, "\\.")}(?![\\w$])`).test(text);

// The parameter names of the callback that starts `call`: `(as, key, t) =>`,
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

// The one function an authMatrix call checks, or null. The call has to be awaited, so its test
// can't end before authMatrix compares the rows, and its first argument has to be the matrix it
// compares them with: HOST_ONLY, or SCANNER for the door scanner. Its callback has to call
// exactly one function through its first parameter (the row's caller), and pass its second
// parameter (the row's key) as `key` every time. A setup step on `t` or with PROF_KEY runs the
// same way on every row, so it checks nothing. A second function called through the row's caller
// could throw first on a refused row, so the matrix would never find out whether the function
// after it refuses.
function matrixCheck({ awaited, args }: MatrixCall): string | null {
  const matrix = /^\s*(HOST_ONLY|SCANNER)\s*,/.exec(args);
  if (!awaited || !matrix) return null;
  const call = args.slice(matrix[0].length);
  const [as, key] = params(call);
  if (!as || !key) return null;
  const through = new RegExp(`(?<![\\w$.])${as.replace(/\$/g, "\\$")}\\s*\\.\\s*(?:query|mutation|action)\\s*\\(`, "g");
  const calls = [...call.matchAll(through)].map((m) => {
    const start = m.index + m[0].length;
    return call.slice(start, skipCode(call, start, ")") - 1);
  });
  const refs = new Set(calls.map((a) => /^\s*((?:api|internal)(?:\.[\w$]+)+)\s*,/.exec(a)?.[1] ?? ""));
  const [ref] = refs;
  if (refs.size !== 1 || !ref || !calls.every((a) => passesKey(a, key))) return null;
  return matrix[1] === "HOST_ONLY" || DOOR.includes(ref) ? ref : null;
}

// What makes vitest skip a test, or pass it when it throws, while `vitest run` still exits 0:
// it.skip and describe.skip, .todo, .skipIf and .runIf, a test's own skip() or { skip: true } in
// its options, .only (every other test in that file is skipped) and .fails (the test passes when
// it throws). F39.2 and F39.3 would still count the names inside. xit, xtest and xdescribe are
// Jest's skips.
const SKIP_WORDS = ["skip", "skipIf", "runIf", "todo", "fails", "only", "xit", "xtest", "xdescribe"];

// Each skip word in a test file's code, as "<line> <word>". Comments, strings and regexes don't
// count.
function skipWords(src: string): string[] {
  const code = codeOnly(src);
  const word = new RegExp(`(?<![\\w$])(?:${SKIP_WORDS.join("|")})(?![\\w$])`, "g");
  return [...code.matchAll(word)].map((m) => `${code.slice(0, m.index).split("\n").length} ${m[0]}`);
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

  it("F39.3 every function with a key arg, except checkin.pass.amHost, is the one function an awaited authMatrix(HOST_ONLY or SCANNER, ...) call checks", () => {
    const checked = new Set(matrices.map(matrixCheck));
    const keyed = fns.filter((f) => f.hasKey && !NO_MATRIX.includes(f.ref));
    expect(keyed.filter((f) => !checked.has(f.ref)).map((f) => f.ref)).toEqual([]);
  });

  it("F39.3 a function counts only when an awaited authMatrix(HOST_ONLY or SCANNER, ...) calls it, and nothing else, as the row's caller with the row's key", () => {
    const check = (src: string) => authMatrixCalls(withoutComments(src)).map(matrixCheck);
    // The shapes checkin/prof.test.ts uses.
    expect(check(`await authMatrix(HOST_ONLY, (as, key) => as.query(api.a.names, { key, channel: CH }))`)).toEqual(["api.a.names"]);
    expect(
      check(`await authMatrix(SCANNER, async (as, key) => { if (!(await as.query(api.checkin.pass.canScan, { key }))) throw new Error("no"); })`),
    ).toEqual(["api.checkin.pass.canScan"]);
    expect(
      check(`await authMatrix(HOST_ONLY, async (as, key, t) => {
        const poll = await t.mutation(api.setup.ask, { key: PROF_KEY, channel: CH });
        await as.mutation(api.a.end, { key, poll });
      })`),
    ).toEqual(["api.a.end"]);
    expect(check(`const m = await authMatrix(HOST_ONLY, async function (who, k) { await who.mutation(api.a.end, { poll, key: k }); })`)).toEqual([
      "api.a.end",
    ]);
    // Without HOST_ONLY or SCANNER first, nothing compares the rows, so a function anyone can call passes.
    expect(check(`await authMatrix((as, key) => as.query(api.a.names, { key }))`)).toEqual([null]);
    expect(check(`expect(await authMatrix((as, key) => as.query(api.a.names, { key }))).toMatchObject({ googleHost: true, profKey: true })`)).toEqual([
      null,
    ]);
    expect(check(`await authMatrix(OPEN, (as, key) => as.query(api.a.names, { key }))`)).toEqual([null]);
    expect(check(`await authMatrix({ ...HOST_ONLY, typedHostEmail: true }, (as, key) => as.query(api.a.names, { key }))`)).toEqual([null]);
    // SCANNER lets the kiosk key through, so it checks only the door scanner's two functions.
    expect(check(`await authMatrix(SCANNER, (as, key) => as.query(api.a.names, { key }))`)).toEqual([null]);
    // Not awaited: the test can end before authMatrix compares the rows.
    expect(check(`authMatrix(HOST_ONLY, (as, key) => as.query(api.a.names, { key }))`)).toEqual([null]);
    expect(check(`void authMatrix(HOST_ONLY, (as, key) => as.query(api.a.names, { key }))`)).toEqual([null]);
    // Used only as a setup step, on `t` or as the row's caller with PROF_KEY: not checked.
    expect(check(`await authMatrix(HOST_ONLY, async (as, key, t) => { await t.mutation(api.setup.ask, { key: PROF_KEY }); })`)).toEqual([null]);
    expect(check(`await authMatrix(HOST_ONLY, async (as, key) => { await as.mutation(api.setup.ask, { key: PROF_KEY }); })`)).toEqual([null]);
    // Called without the row's key: not checked.
    expect(check(`await authMatrix(HOST_ONLY, (as, k) => as.query(api.a.names, { key }))`)).toEqual([null]);
    expect(check(`await authMatrix(HOST_ONLY, (as, key) => as.query(api.a.names, { channel: key }))`)).toEqual([null]);
    expect(check(`await authMatrix(HOST_ONLY, (as) => as.query(api.a.names, {}))`)).toEqual([null]);
    // Two functions called as the row's caller: answer throws first on a refused row, so share is never tried there.
    expect(
      check(`await authMatrix(HOST_ONLY, async (as, key) => {
        await as.mutation(api.a.answer, { key, id });
        await as.mutation(api.a.share, { key, id });
      })`),
    ).toEqual([null]);
    // A function passed by name: no callback to read.
    expect(check(`await authMatrix(HOST_ONLY, tryNames)`)).toEqual([null]);
  });

  it("F39.3 the scan reads authMatrix calls, strings, regexes and comments the way a test file has them", () => {
    const src = withoutComments(`
      // await authMatrix(HOST_ONLY, as => as.query(api.only.inAComment, {}))
      await authMatrix(HOST_ONLY, async (as, key) => {
        const label = "a ) inside a string";
        const re = /[)'"]/g;
        await as.mutation(api.checkin.quiz.end, { key, poll: \`\${(1 + 2) / 3}\` });
      });
      as.query(api.outside.theCall, {});
      /* api.block.comment */`);
    const calls = authMatrixCalls(src);
    expect(calls).toHaveLength(1);
    expect(names(calls[0].args, "api.checkin.quiz.end")).toBe(true);
    expect(matrixCheck(calls[0])).toBe("api.checkin.quiz.end");
    expect(names(calls[0].args, "api.outside.theCall")).toBe(false);
    expect(names(src, "api.outside.theCall")).toBe(true);
    expect(names(src, "api.only.inAComment")).toBe(false);
    expect(names(src, "api.block.comment")).toBe(false);
    expect(names("api.checkin.quiz.endDay", "api.checkin.quiz.end")).toBe(false);
  });
});

// Outside the F39 block, so a describe.skip on that block can't hide this check.
describe("F39.2 every Convex test runs", () => {
  it("F39.2 no Convex test file skips a test, marks one todo, runs one alone or expects one to fail", () => {
    // The check reads this file too, so a describe.skip on the F39 block above can't hide.
    expect(ALL_SOURCES["./coverage.test.ts"]).toContain(`describe("F39.2 every Convex test runs"`);
    expect(Object.keys(ALL_SOURCES).length).toBe(Object.keys(SOURCES).length + 1);
    const found = Object.entries(ALL_SOURCES).flatMap(([file, src]) => skipWords(src).map((at) => `${file.replace(/^\.\//, "")}:${at}`));
    expect(found).toEqual([]);
  });

  it("F39.2 the scan finds each way to skip a test, and not the same words in comments, strings, regexes or longer names", () => {
    expect(skipWords(`it.skip("a", () => {});\ndescribe.skip("b", () => {});`)).toEqual(["1 skip", "2 skip"]);
    expect(skipWords(`it.todo("a");\ndescribe.todo("b");`)).toEqual(["1 todo", "2 todo"]);
    expect(skipWords(`it.fails("a", async () => {});`)).toEqual(["1 fails"]);
    expect(skipWords(`it.skipIf(true)("a", () => {});\ndescribe.runIf(false)("b", () => {});`)).toEqual(["1 skipIf", "2 runIf"]);
    expect(skipWords(`it.only("a", () => {});\ndescribe.only("b", () => {});`)).toEqual(["1 only", "2 only"]);
    expect(skipWords(`it.concurrent.skip("a", () => {});\ntest.skip.each([1])("b %i", () => {});`)).toEqual(["1 skip", "2 skip"]);
    expect(skipWords(`it("a", { skip: true }, () => {});\nit("b", { fails: true }, () => {});`)).toEqual(["1 skip", "2 fails"]);
    expect(skipWords(`it("a", ({ skip }) => {\n  skip();\n});\nit("b", (ctx) => ctx.skip());`)).toEqual(["1 skip", "2 skip", "4 skip"]);
    expect(skipWords(`xit("a", () => {});\nxtest("b", () => {});\nxdescribe("c", () => {});`)).toEqual(["1 xit", "2 xtest", "3 xdescribe"]);
    // The same words in comments, strings, test names, regexes and longer names don't count.
    expect(
      skipWords(`// it.skip("a")
        /* it.only("b") */
        it("hosts only; skip nothing", () => {
          expect(msg).toMatch(/only|skip|todo/);
          expect(\`\${n} skipped\`).toBe(skipLiteral(SKIP_MODULES, onlyOnce));
        });`),
    ).toEqual([]);
    // A regex with a quote in it doesn't hide the lines after it.
    expect(skipWords(`await expect(p).rejects.toThrow(/didn't/);\nit.skip("a", () => {});`)).toEqual(["2 skip"]);
  });
});
