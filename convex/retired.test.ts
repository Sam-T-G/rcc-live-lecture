// UZ: the professor view's own tables are retired (Sam's decision 1, 2026-10-30). #/host runs on
// polls/pollAnswers, groups/groupSettings/groupPoints/groupResults and questions/questionVotes,
// and convex/host/, the only code that read or wrote quizQuestions, answers, hostRooms,
// pointEvents and studentQuestions, is gone with its functions (host.qa.ask and
// host.answers.submit took any signed-in caller: host-backend-6). The five definitions stay in
// convex/schema.ts so prod keeps its rows and no push has to drop a table that holds data
// (design.md section 3). TypeScript still takes those table names while the definitions stay, so
// this file is the guard: it reads the text of every .ts and .tsx file under convex/ and src/,
// through Vite the way coverage.test.ts does (Convex's test runtime has no file system).
// (This file was convex/hostAuth.test.ts, the role checks on the host functions it replaces.)
import { describe, expect, it } from "vitest";
import API_DTS from "./_generated/api.d.ts?raw";
import SCHEMA_SRC from "./schema.ts?raw";
import schema from "./schema";
import { modules } from "./test.setup";

// Every .ts and .tsx file under convex/ (but _generated/) and src/, as text. Vite's glob leaves
// out the file that calls it, so this one isn't in it.
const CONVEX_SOURCES = import.meta.glob<string>(["./**/*.ts", "./**/*.tsx", "!./_generated/**"], { query: "?raw", import: "default", eager: true });
const SRC_SOURCES = import.meta.glob<string>(["../src/**/*.ts", "../src/**/*.tsx"], { query: "?raw", import: "default", eager: true });
// Any code file left under convex/host/, deployable or not.
const HOST_FILES = import.meta.glob("./host/**/*.{ts,tsx,js,jsx,mjs,cjs}");

// The retired tables, in the order schema.ts defines them.
const RETIRED = ["quizQuestions", "answers", "hostRooms", "pointEvents", "studentQuestions"];

// The schema keeps the definitions, so the scan leaves it out (and this file, which names the
// tables to look for them).
const EXEMPT = ["convex/schema.ts", "convex/retired.test.ts"];

// What reaching a retired table or a deleted host function looks like in code.
const REACHES = [
  // Four of the names belong to no live table, so any string holding one counts:
  // ctx.db.query("quizQuestions"), v.id("studentQuestions"), Id<"hostRooms">.
  /(["'`])(?:quizQuestions|hostRooms|pointEvents|studentQuestions)\1/g,
  // "answers" is an everyday word too, so only the ways code reaches that table count.
  /(?<![\w$])(?:query|insert)\s*\(\s*(["'`])answers\1/g,
  /(?<![\w$])db\s*\.\s*(?:get|patch|replace|delete|normalizeId)\s*\(\s*(["'`])answers\1/g,
  /(?<![\w$])v\s*\.\s*id\s*\(\s*(["'`])answers\1/g,
  /(?<![\w$])(?:Id|Doc)\s*<\s*(["'`])answers\1/g,
  // The deleted functions: api.host.qa.ask, internal.host.qa.applyTopics, or a path like "host/qa:ask".
  /(?<![\w$])(?:api|internal)\s*\.\s*host\s*\./g,
  /["'`]host\/[\w/]+:\w+/g,
];

// Each place in `text` that reaches a retired table or a host function, as "<line>: <match>".
function reaches(text: string): string[] {
  return REACHES.flatMap((re) => [...text.matchAll(re)].map((m) => `${text.slice(0, m.index).split("\n").length}: ${m[0]}`));
}

// Every scanned file by its path from the repo root ("convex/live/questions.ts",
// "src/teams/host/Page.tsx"), with its text.
function sources(): [string, string][] {
  const convex = Object.entries(CONVEX_SOURCES).map(([file, text]): [string, string] => [file.replace(/^\.\//, "convex/"), text]);
  const src = Object.entries(SRC_SOURCES).map(([file, text]): [string, string] => [file.replace(/^\.\.\//, ""), text]);
  return [...convex, ...src].filter(([file]) => !EXEMPT.includes(file));
}

// A validator as a short string: "string", "float64?", "id(quizQuestions)", "array(string)",
// "\"open\" | \"closed\"". A field's "?" means optional.
type Validator = { kind: string; isOptional: string; tableName?: string; value?: unknown; element?: Validator; members?: Validator[] };
function shape(v: Validator): string {
  const base =
    v.kind === "id"
      ? `id(${v.tableName})`
      : v.kind === "literal"
        ? JSON.stringify(v.value)
        : v.kind === "array"
          ? `array(${shape(v.element!)})`
          : v.kind === "union"
            ? v.members!.map(shape).join(" | ")
            : v.kind;
  return v.isOptional === "optional" ? `${base}?` : base;
}

describe("UZ the professor view's own tables are retired", () => {
  it("F31.1 nothing outside schema.ts and _generated references the five retired tables or api.host", () => {
    // The scan finds each way code reaches a retired table or a host function, and leaves the
    // live tables and plain words alone.
    const found = [
      `ctx.db.query("quizQuestions")`,
      `await ctx.db.insert("pointEvents", { channel })`,
      `questionId: v.id("studentQuestions")`,
      `type Room = Doc<'hostRooms'>`,
      "ctx.db.query(`answers`)",
      `await ctx.db.insert(\n  "answers",\n  row,\n)`,
      `await ctx.db.get("answers", id)`,
      `await ctx.db.delete("answers", id)`,
      `choice: v.id("answers")`,
      `const a: Id<"answers"> = id`,
      `await ctx.runQuery(api.host.qa.list, { channel })`,
      `await ctx.runMutation(internal.host.qa.applyTopics, { items })`,
      `makeFunctionReference("host/qa:ask")`,
    ];
    for (const text of found) expect(reaches(text), text).toHaveLength(1);
    const left = [
      `ctx.db.query("pollAnswers").withIndex("by_poll", (q) => q.eq("poll", id))`,
      `const answers = await ctx.db.query("pollAnswers").collect(); return answers.length;`,
      `// the old studentQuestions table and api calls to host functions stop being used`,
      `await ctx.runQuery(api.live.questions.forHost, { channel })`,
      `await t.mutation(api.checkin.quiz.answer, { poll, choice: 0 })`,
      `<Link to="host/Points">Points</Link>`,
      `const route = "#/host";`,
      `params.get("answers")`,
    ];
    for (const text of left) expect(reaches(text), text).toEqual([]);
    expect(reaches(`one\ntwo ctx.db.query("hostRooms")`)).toEqual([`2: "hostRooms"`]);

    // It reads the real files: the modules, the tests and the screens.
    const files = sources();
    expect(files.length).toBeGreaterThan(100);
    const names = files.map(([file]) => file);
    for (const file of ["convex/live/questions.ts", "convex/checkin/quiz.ts", "convex/coverage.test.ts", "src/teams/host/Page.tsx", "src/teams/host/QA.tsx"])
      expect(names).toContain(file);
    expect(names.filter((file) => file.startsWith("convex/_generated/") || EXEMPT.includes(file))).toEqual([]);
    expect(files.flatMap(([file, text]) => reaches(text).map((at) => `${file}:${at}`))).toEqual([]);
  });

  it("host-backend-6 convex/host/ has no code left, so host.qa.ask, host.answers.submit and every other host function are gone from the deploy", () => {
    expect(Object.keys(modules).filter((file) => file.startsWith("./host/"))).toEqual([]);
    expect(Object.keys(HOST_FILES)).toEqual([]);
  });

  it("F31.5 convex/_generated/api.d.ts names exactly the Convex modules on disk, none under host/", () => {
    const imported = [...API_DTS.matchAll(/^import type \* as \w+ from "\.\.\/(.+)\.js";$/gm)].map((m) => m[1]).sort();
    const listed = [...API_DTS.matchAll(/^\s+"?([\w/]+)"?: typeof \w+;$/gm)].map((m) => m[1]).sort();
    // Every module convex-test loads, the way codegen names it; codegen leaves schema.ts out.
    const onDisk = Object.keys(modules)
      .map((file) => file.replace(/^\.\//, "").replace(/\.[cm]?[jt]s$/, ""))
      .filter((mod) => !mod.startsWith("_generated/") && mod !== "schema")
      .sort();
    expect(onDisk.length).toBeGreaterThan(10);
    expect(imported).toEqual(onDisk);
    expect(listed).toEqual(onDisk);
    expect(onDisk.filter((mod) => mod.startsWith("host/"))).toEqual([]);
  });

  it("F31.4 schema still defines quizQuestions, answers, hostRooms, pointEvents and studentQuestions with the fields and indexes they had, under the retired comment", () => {
    const tables = schema.tables as unknown as Record<
      string,
      { validator: { fields: Record<string, Validator> }; " indexes"(): { indexDescriptor: string; fields: string[] }[] } | undefined
    >;
    const now = Object.fromEntries(
      RETIRED.map((name) => {
        const def = tables[name];
        if (!def) return [name, null];
        return [
          name,
          {
            fields: Object.fromEntries(Object.entries(def.validator.fields).map(([field, v]) => [field, shape(v)])),
            indexes: Object.fromEntries(def[" indexes"]().map((i) => [i.indexDescriptor, i.fields])),
          },
        ];
      }),
    );
    expect(now).toEqual({
      quizQuestions: {
        fields: { channel: "string", index: "float64", text: "string", choices: "array(string)", correct: "float64", status: `"open" | "closed"`, points: "float64", openedAt: "float64" },
        indexes: { by_channel: ["channel"] },
      },
      answers: {
        fields: { questionId: "id(quizQuestions)", user: "string", name: "string", choice: "float64", correct: "boolean", points: "float64", at: "float64" },
        indexes: { by_question: ["questionId"], by_question_and_user: ["questionId", "user"] },
      },
      hostRooms: {
        fields: { channel: "string", salt: "string", dayStart: "float64?" },
        indexes: { by_channel: ["channel"] },
      },
      pointEvents: {
        fields: { channel: "string", user: "string", name: "string", delta: "float64", reason: "string", at: "float64" },
        indexes: { by_channel: ["channel"] },
      },
      studentQuestions: {
        fields: {
          channel: "string",
          index: "float64",
          user: "string",
          name: "string",
          text: "string",
          visibility: `"public" | "private"`,
          topic: "string?",
          cluster: "string?",
          status: `"new" | "keep" | "dismissed"`,
          answer: "string?",
          shared: "boolean",
          at: "float64",
        },
        indexes: { by_channel: ["channel"] },
      },
    });

    // The retired comment comes once, and the five tables are the only ones defined after it, so
    // its "No function reads or writes the five tables below" stays true of what follows it.
    const comment = "// Retired 2026-10-30 (Sam's decision 1).";
    expect(SCHEMA_SRC.split(comment)).toHaveLength(2);
    const after = SCHEMA_SRC.slice(SCHEMA_SRC.indexOf(comment));
    expect([...after.matchAll(/^\s+(\w+): defineTable\(/gm)].map((m) => m[1])).toEqual(RETIRED);
  });
});
