// @vitest-environment node
// Pressing "Download extra credit (CSV)" on #/host Points (Boards.tsx), with made-up query results
// and a stand-in page and URL (no browser). Boards.download.test.ts checks saveExtraCredit itself;
// this checks that the button goes through it, so an inline download that names the file with the
// UTC date or drops the file's URL right after the click fails here (UB-fixcheck-4). Runs in
// Pacific time, where RCC is, at 5:30 PM on Thu Nov 5, which is already Nov 6 in UTC.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getFunctionName, type FunctionReference } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PointsTab } from "./Boards";

const results: Record<string, unknown> = {};
// What each Button does when pressed, under its words, and every query the button's handler sends.
const { handlers, queries } = vi.hoisted(() => ({
  handlers: {} as Record<string, () => unknown>,
  queries: [] as [string, unknown][],
}));
const RED = { team: 0, color: "red", label: "Red" };
const saved = { lecture: "l1", endedAt: Date.UTC(2026, 10, 6, 1, 30), name: "Sample student 1", email: "student1@example.edu", team: RED, rank: 1, points: 3, ec: 5 };
vi.mock("convex/react", () => ({
  useQuery: (ref: FunctionReference<"query">) => results[getFunctionName(ref)],
  useMutation: () => async () => null,
  // One page of saved extra credit, the way api.live.groups.results pages it.
  useConvex: () => ({
    query: async (ref: FunctionReference<"query">, args: unknown) => {
      queries.push([getFunctionName(ref), args]);
      return { page: [saved], isDone: true, continueCursor: "end" };
    },
  }),
}));
vi.mock("../../blocks/deck", () => ({ CHANNEL: "gdg" }));
vi.mock("../../blocks/kit", async (importOriginal) => {
  const kit = await importOriginal<typeof import("../../blocks/kit")>();
  const { createElement } = await import("react");
  return {
    ...kit,
    Button: (p: Parameters<typeof kit.Button>[0]) => {
      handlers[String(p["aria-label"] ?? p.children)] = p.onClick as () => unknown;
      return createElement(kit.Button, p);
    },
  };
});

const log: string[] = [];
const blobs: string[] = [];
const anchor = { href: "", download: "", click: () => log.push(`click ${anchor.download}`), remove: () => log.push("remove") };

beforeEach(() => {
  for (const k of Object.keys(handlers)) delete handlers[k];
  for (const k of Object.keys(results)) delete results[k];
  queries.length = 0;
  log.length = 0;
  blobs.length = 0;
  Object.assign(results, {
    "live/groups:status": { size: 4, locked: true, locksAt: null },
    "live/groups:leaderboard": { questions: 1, teams: [] },
    "live/groups:roster": [],
    "live/groups:pointLog": [],
  });
  vi.stubEnv("TZ", "America/Los_Angeles");
  vi.useFakeTimers({ now: Date.UTC(2026, 10, 6, 1, 30) });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("UB the 'Download extra credit (CSV)' button", () => {
  it("UB-fixcheck-4 UB-spec-4 UB-risk-3 saves extra-credit-gdg-2026-11-05.csv (the local date) through a link on the page and keeps the file's URL for 60 s", async () => {
    renderToStaticMarkup(createElement(PointsTab));
    const press = handlers["Download extra credit (CSV)"];
    expect(press).toBeTypeOf("function");
    vi.stubGlobal("document", { createElement: () => anchor, body: { append: () => log.push("append") } });
    vi.stubGlobal("URL", {
      createObjectURL: (b: Blob) => {
        blobs.push(b.type);
        return "blob:extra-credit";
      },
      revokeObjectURL: (u: string) => log.push(`revoke ${u}`),
    });
    press();
    await vi.advanceTimersByTimeAsync(0);
    expect(queries).toEqual([["live/groups:results", { channel: "gdg", paginationOpts: { numItems: 200, cursor: null } }]]);
    expect(blobs).toEqual(["text/csv;charset=utf-8"]);
    expect(log).toEqual(["append", "click extra-credit-gdg-2026-11-05.csv", "remove"]);
    await vi.advanceTimersByTimeAsync(59_000);
    expect(log).not.toContain("revoke blob:extra-credit");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(log.at(-1)).toBe("revoke blob:extra-credit");
  });
});
