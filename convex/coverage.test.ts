// F39: every Convex function has a test, every host-only function has an authMatrix test that
// calls it as each row's caller, and every Convex test runs. The functions come from loading each
// Convex module; which ones are host-only comes from reading each module's source for the staff
// checks (convex/checkin/prof.ts). The test files' source comes in as text through Vite and is
// read with comments removed, so a name in a comment doesn't count.
import { describe, expect, it } from "vitest";
import SELF from "./coverage.test.ts?raw";
import { modules } from "./test.setup";

// Every other convex/**/*.test.ts as text: Vite's glob leaves out the file that calls it. Their
// names count; this file's own examples don't.
const SOURCES = import.meta.glob<string>("./**/*.test.ts", { query: "?raw", import: "default", eager: true });
// Every Convex test file, this one included, for the skip check.
const ALL_SOURCES: Record<string, string> = { ...SOURCES, "./coverage.test.ts": SELF };
// Every Convex module's source as text: the same files test.setup.ts loads, minus _generated/.
const MODULE_SOURCES = import.meta.glob<string>("./**/!(*.*.*)*.ts", { query: "?raw", import: "default", eager: true });
// F39.2 leaves convex/host/ out until UZ deletes it (and this skip with it). F39.3 doesn't: its
// host-only functions are still deployed, so each one still needs its authMatrix test.
const SKIP_MODULES = ["host/"];
// The staff checks: a function whose handler calls one of these, or calls a function in its own
// file that does, is host-only (requireHost in convex/lib.ts is requireProf by another name).
const GUARDS = ["requireProf", "requireAdmin", "requireScanner", "requireHost"];
// Functions that answer whether the caller may do something, instead of refusing. Their tests
// throw when the answer is no, so authMatrix checks them like any host-only function.
const ANSWERS = ["api.checkin.pass.amHost", "api.checkin.pass.canScan"];
// The door scanner: the only functions a scanner and a paired iPad may call, so the only ones an
// authMatrix(SCANNER, ...) call counts for.
const DOOR = ["api.checkin.pass.scan", "api.checkin.pass.canScan"];

type Fn = { ref: string; hasKey: boolean; guarded: boolean; skipped: boolean };
type Registered = { isQuery?: boolean; isMutation?: boolean; isAction?: boolean; isInternal?: boolean; exportArgs?: () => string };

// Every query, mutation and action a Convex module exports, as `api.<module>.<name>` or
// `internal.<module>.<name>`, whether its args include `key` (none may: the "ROLES-UI no
// function takes a key arg" test below), whether it calls a staff check, and whether its module
// is in SKIP_MODULES.
async function convexFunctions(): Promise<Fn[]> {
  const out: Fn[] = [];
  for (const [file, load] of Object.entries(modules)) {
    const mod = file.replace(/^\.\//, "").replace(/\.[cm]?[jt]s$/, "");
    if (mod.startsWith("_generated/")) continue;
    const skipped = SKIP_MODULES.some((s) => mod.startsWith(s));
    const guarded = guardedNames(MODULE_SOURCES[file] ?? "");
    for (const [name, value] of Object.entries((await load()) as Record<string, unknown>)) {
      const f = value as Registered;
      if (typeof value !== "function" || !(f.isQuery || f.isMutation || f.isAction)) continue;
      const args = JSON.parse(f.exportArgs?.() ?? "{}") as { type?: string; value?: Record<string, unknown> };
      out.push({
        ref: `${f.isInternal ? "internal" : "api"}.${mod.split("/").join(".")}.${name}`,
        hasKey: args.type === "object" && !!args.value && "key" in args.value,
        guarded: guarded.has(name),
        skipped,
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

// A module's top-level declarations (function, const, let, var, exported or not), each with the
// code after its name up to the next one. Top-level means the line starts with it, as Prettier
// writes every file here.
function declarations(code: string): { name: string; text: string }[] {
  const starts = [...code.matchAll(/^(?:export\s+)?(?:async\s+)?(?:function\s*\*?\s*|const\s+|let\s+|var\s+)([A-Za-z_$][\w$]*)/gm)];
  return starts.map((m, i) => ({ name: m[1], text: code.slice(m.index + m[0].length, starts[i + 1]?.index ?? code.length) }));
}

// Whether `code` calls `name` (`name(` or `x.name(`, never `rename(`), or uses it as a Convex
// function's handler (`handler: name`).
const callsName = (code: string, name: string) => {
  const n = name.replace(/\$/g, "\\$");
  return new RegExp(`(?<![\\w$])${n}\\s*\\(`).test(code) || new RegExp(`(?<![\\w$])handler\\s*:\\s*${n}(?![\\w$])`).test(code);
};

// The names of a module's top-level declarations that call a staff check, directly or through
// other declarations in the same module. Comments, strings and regexes don't count.
function guardedNames(src: string): Set<string> {
  const decls = declarations(codeOnly(src));
  const out = new Set<string>();
  for (let grew = true; grew; ) {
    grew = false;
    for (const d of decls) {
      if (out.has(d.name) || ![...GUARDS, ...out].some((g) => callsName(d.text, g))) continue;
      out.add(d.name);
      grew = true;
    }
  }
  return out;
}

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

// The one function an authMatrix call checks, or null. The call has to be awaited, so its test
// can't end before authMatrix compares the rows, and its first argument has to be the matrix it
// compares them with: HOST_ONLY, ADMIN_ONLY or SCANNER from test.helpers.ts. Its callback has to
// call exactly one function through its first parameter (the row's caller). A setup step on `t`
// runs the same way on every row, so it checks nothing. A second function called through the
// row's caller could throw first on a refused row, so the matrix would never find out whether
// the function after it refuses. Which matrix fits is checked when the test runs: authMatrix
// fails when any row's result differs from it. SCANNER counts only for the functions in DOOR.
function matrixCheck({ awaited, args }: MatrixCall): string | null {
  const matrix = /^\s*(HOST_ONLY|ADMIN_ONLY|SCANNER)\s*,/.exec(args);
  if (!awaited || !matrix) return null;
  const call = args.slice(matrix[0].length);
  const [as] = params(call);
  if (!as) return null;
  const through = new RegExp(`(?<![\\w$.])${as.replace(/\$/g, "\\$")}\\s*\\.\\s*(?:query|mutation|action)\\s*\\(`, "g");
  const called = [...call.matchAll(through)].map((m) => {
    const start = m.index + m[0].length;
    return call.slice(start, skipCode(call, start, ")") - 1);
  });
  const refs = new Set(called.map((a) => /^\s*((?:api|internal)(?:\.[\w$]+)+)\s*(?:,|$)/.exec(a)?.[1] ?? ""));
  const [ref] = refs;
  if (refs.size !== 1 || !ref) return null;
  // SCANNER lets a scanner and a paired iPad in, so it fits only the door scanner.
  return matrix[1] !== "SCANNER" || DOOR.includes(ref) ? ref : null;
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

  it("finds the functions, their sources and the test files to check", () => {
    expect(fns.length).toBeGreaterThan(0);
    expect(fns.some((f) => f.ref.startsWith("internal."))).toBe(true);
    expect(fns.some((f) => f.guarded)).toBe(true);
    expect(tests.length).toBeGreaterThan(0);
    // The source glob reads exactly the modules test.setup.ts loads, so no module goes unread.
    const loaded = Object.keys(modules).filter((f) => !f.startsWith("./_generated/"));
    expect(Object.keys(MODULE_SOURCES).sort()).toEqual(loaded.sort());
  });

  it("F39.2 every exported function outside convex/host/ is named in a test", () => {
    expect(fns.filter((f) => !f.skipped && !names(all, f.ref)).map((f) => f.ref)).toEqual([]);
  });

  it("F39.2 every HTTP route is called with its method in a test", async () => {
    const untested = (await httpRoutes()).filter(([path, method]) => {
      const call = new RegExp(`\\.fetch\\(\\s*(["'\`])${path}\\1\\s*,\\s*\\{[^}]*method:\\s*["']${method}["']`);
      return !call.test(all);
    });
    expect(untested).toEqual([]);
  });

  it("F39.3 every host-only public function (it calls requireProf, requireAdmin, requireScanner or requireHost, or a function in its own file that does), every function with a key arg, and amHost and canScan, is the one function an awaited authMatrix(HOST_ONLY, ADMIN_ONLY or SCANNER, ...) call checks", () => {
    const checked = new Set(matrices.map(matrixCheck));
    const hostOnly = fns.filter((f) => f.ref.startsWith("api.") && (f.guarded || f.hasKey || ANSWERS.includes(f.ref)));
    expect(hostOnly.filter((f) => !checked.has(f.ref)).map((f) => f.ref)).toEqual([]);
  });

  it("ROLES-UI no function takes a key arg, convex/host/ included: the server reads who is calling from the sign-in (DECK_BRIDGE_KEY reaches POST /deck in the request body, not as an arg)", async () => {
    expect(fns.some((f) => f.skipped)).toBe(true); // convex/host/ is in the list
    expect(fns.filter((f) => f.hasKey).map((f) => f.ref)).toEqual([]);
  });

  it("F39.3 the staff-check scan finds the host-only functions in the real modules and leaves the open ones out", () => {
    const guarded = fns.filter((f) => f.guarded).map((f) => f.ref);
    expect(guarded).toEqual(
      expect.arrayContaining([
        "api.checkin.read.names",
        "api.checkin.quiz.ask",
        "api.checkin.attendance.sheet",
        "api.checkin.pass.scan",
        "api.live.groups.setSize",
        "api.staff.people",
        "api.staff.add",
        "api.staff.approvePairing",
        "api.staff.unpair",
        "api.host.qa.list",
        "api.host.points.adjust",
      ]),
    );
    for (const open of ["api.checkin.read.count", "api.checkin.pass.refresh", "api.live.questions.remove", "api.staff.me", "api.staff.requestPairing", "api.staff.deviceStatus"])
      expect(guarded).not.toContain(open);
  });

  it("F39.3 the staff-check scan follows helpers in the same file and skips comments, strings and longer names", () => {
    const scan = (src: string) => [...guardedNames(src)].sort();
    expect(scan(`export const a = query({ handler: async (ctx) => { await requireProf(ctx); } });\nexport const b = query({ handler: async () => 1 });`)).toEqual(["a"]);
    // Through a helper in the same file, two levels deep, and through a module object.
    expect(
      scan(
        `async function load(ctx) {\n  await requireAdmin(ctx);\n}\nconst outer = async (ctx) => load(ctx);\nexport const c = mutation({ handler: async (ctx) => { await outer(ctx); } });\nexport const d = query({ handler: async (ctx) => prof.requireScanner(ctx) });`,
      ),
    ).toEqual(["c", "d", "load", "outer"]);
    // A named function used as the handler.
    expect(scan(`async function askHandler(ctx, args) {\n  await requireProf(ctx);\n}\nexport const h = mutation({ args: {}, handler: askHandler });\nexport const i = mutation({ args: {}, handler: askHandlerTwo });`)).toEqual([
      "askHandler",
      "h",
    ]);
    // Not a call: a comment, a string, a longer name, or the name without a call.
    expect(
      scan(
        `// requireProf(ctx)\nexport const e = query({ handler: async () => "requireProf(ctx)" });\nexport const f = query({ handler: async (ctx) => myrequireProf(ctx) });\nexport const g = query({ handler: async () => requireProf });`,
      ),
    ).toEqual([]);
  });

  it("F39.3 a function counts only when an awaited authMatrix(HOST_ONLY, ADMIN_ONLY or SCANNER, ...) calls it, and nothing else, as the row's caller", () => {
    const check = (src: string) => authMatrixCalls(withoutComments(src)).map(matrixCheck);
    // The shapes the tests use.
    expect(check(`await authMatrix(HOST_ONLY, (as) => as.query(api.a.names, { channel: CH }))`)).toEqual(["api.a.names"]);
    expect(check(`await authMatrix(ADMIN_ONLY, (as) => as.query(api.staff.people))`)).toEqual(["api.staff.people"]);
    expect(
      check(`await authMatrix(SCANNER, async (as, t, device) => { if (!(await as.query(api.checkin.pass.canScan, { device }))) throw new Error("no"); })`),
    ).toEqual(["api.checkin.pass.canScan"]);
    expect(
      check(`await authMatrix(HOST_ONLY, async (as, t) => {
        const poll = await admin(t).mutation(api.setup.ask, { channel: CH });
        await as.mutation(api.a.end, { poll });
      })`),
    ).toEqual(["api.a.end"]);
    expect(check(`const m = await authMatrix(HOST_ONLY, async function (who) { await who.mutation(api.a.end, { poll }); })`)).toEqual(["api.a.end"]);
    expect(check(`await authMatrix(SCANNER, (as, t, device) => as.mutation(api.checkin.pass.scan, { device, channel: CH, code }))`)).toEqual([
      "api.checkin.pass.scan",
    ]);
    // SCANNER lets a scanner and a paired iPad in, so it counts only for the door scanner: a
    // professor function checked with SCANNER would pass with the door let in.
    expect(check(`await authMatrix(SCANNER, (as, t, device) => as.query(api.checkin.quiz.history, { device, channel: CH }))`)).toEqual([null]);
    expect(check(`await authMatrix(SCANNER, (as) => as.query(api.host.qa.list, { channel: CH }))`)).toEqual([null]);
    // Without a matrix from test.helpers.ts first, nothing compares the rows, so a function anyone can call passes.
    expect(check(`await authMatrix((as) => as.query(api.a.names, {}))`)).toEqual([null]);
    expect(check(`expect(await authMatrix((as) => as.query(api.a.names, {}))).toMatchObject({ googleAdmin: true })`)).toEqual([null]);
    expect(check(`await authMatrix(OPEN, (as) => as.query(api.a.names, {}))`)).toEqual([null]);
    expect(check(`await authMatrix({ ...HOST_ONLY, googleStudent: true }, (as) => as.query(api.a.names, {}))`)).toEqual([null]);
    // Not awaited: the test can end before authMatrix compares the rows.
    expect(check(`authMatrix(HOST_ONLY, (as) => as.query(api.a.names, {}))`)).toEqual([null]);
    expect(check(`void authMatrix(HOST_ONLY, (as) => as.query(api.a.names, {}))`)).toEqual([null]);
    // Only a setup step on `t`: every row runs it the same way, so it checks nothing.
    expect(check(`await authMatrix(HOST_ONLY, async (as, t) => { await admin(t).mutation(api.setup.ask, {}); })`)).toEqual([null]);
    expect(check(`await authMatrix(HOST_ONLY, async (as, t) => { await t.mutation(api.setup.ask, {}); })`)).toEqual([null]);
    // A function value run as the row's caller (convex-test runs it inline) names no Convex function.
    expect(check(`await authMatrix(HOST_ONLY, (as) => as.query(readRole))`)).toEqual([null]);
    // Two functions called as the row's caller: answer throws first on a refused row, so share is never tried there.
    expect(
      check(`await authMatrix(HOST_ONLY, async (as) => {
        await as.mutation(api.a.answer, { id });
        await as.mutation(api.a.share, { id });
      })`),
    ).toEqual([null]);
    // A function passed by name: no callback to read.
    expect(check(`await authMatrix(HOST_ONLY, tryNames)`)).toEqual([null]);
  });

  it("F39.3 the scan reads authMatrix calls, strings, regexes and comments the way a test file has them", () => {
    const src = withoutComments(`
      // await authMatrix(HOST_ONLY, as => as.query(api.only.inAComment, {}))
      await authMatrix(HOST_ONLY, async (as) => {
        const label = "a ) inside a string";
        const re = /[)'"]/g;
        await as.mutation(api.checkin.quiz.end, { poll: \`\${(1 + 2) / 3}\` });
      });
      as.query(api.outside.theCall, {});
      /* api.block.comment */`);
    const found = authMatrixCalls(src);
    expect(found).toHaveLength(1);
    expect(names(found[0].args, "api.checkin.quiz.end")).toBe(true);
    expect(matrixCheck(found[0])).toBe("api.checkin.quiz.end");
    expect(names(found[0].args, "api.outside.theCall")).toBe(false);
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
