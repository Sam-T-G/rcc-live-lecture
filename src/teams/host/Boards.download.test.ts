// @vitest-environment node
// "Download extra credit (CSV)" on #/host Points (Boards.tsx): the file's name and how the browser
// saves it, with a stand-in page and URL (no browser). Runs in Pacific time, where RCC is, so a
// class at 5:30 PM is already the next day in UTC.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveExtraCredit } from "./Boards";

vi.mock("convex/react", () => ({ useQuery: () => undefined, useMutation: () => async () => null, useConvex: () => ({}) }));
vi.mock("../../blocks/deck", () => ({ CHANNEL: "gdg" }));

const log: string[] = [];
const anchor = { href: "", download: "", click: () => log.push(`click ${anchor.download}`), remove: () => log.push("remove") };

beforeEach(() => {
  log.length = 0;
  vi.stubEnv("TZ", "America/Los_Angeles");
  vi.useFakeTimers();
  vi.stubGlobal("document", { createElement: () => anchor, body: { append: () => log.push("append") } });
  vi.stubGlobal("URL", { createObjectURL: () => "blob:extra-credit", revokeObjectURL: (u: string) => log.push(`revoke ${u}`) });
});
afterEach(() => vi.useRealTimers());

describe("UB the extra credit CSV download", () => {
  it("UB-risk-3 UB-check-1 names the file with the local date: 5:30 PM Pacific on Thu Nov 5 is extra-credit-gdg-2026-11-05.csv", () => {
    saveExtraCredit("Name\r\n", Date.UTC(2026, 10, 6, 1, 30));
    expect(anchor.download).toBe("extra-credit-gdg-2026-11-05.csv");
  });

  it("UB-spec-4 puts the link on the page to click it and keeps the file's URL for 60 s, since Safari starts the download after the click returns", () => {
    saveExtraCredit("Name\r\n", Date.UTC(2026, 10, 5, 22, 0));
    expect(log).toEqual(["append", "click extra-credit-gdg-2026-11-05.csv", "remove"]);
    vi.advanceTimersByTime(59_000);
    expect(log).not.toContain("revoke blob:extra-credit");
    vi.advanceTimersByTime(1_000);
    expect(log.at(-1)).toBe("revoke blob:extra-credit");
  });
});
