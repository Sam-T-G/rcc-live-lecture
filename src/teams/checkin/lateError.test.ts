// @vitest-environment node
// T18: when the late banner fails on #/checkin/student, ErrorBoundary's row ("The late banner
// didn't load." and Try again) sat fixed at the bottom of the screen, over the page's last line,
// "Not you? Sign out". These checks read checkin.css. The browser check measures it in the screen
// lab (design/lab, scenario phone-late-error, WebKit, 390 x 844 and 320 x 568, light and dark):
// at every scroll position where Not you? Sign out is fully in view, its box doesn't overlap the
// row and document.elementFromPoint across it returns it; at the end of the page Try again is in
// view and on top too. Before this fix the row covered Not you? Sign out at 320 x 568 and
// overlapped its box by 6px at 390 x 844.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "../../styles/cssRules";

const rules = parse(readFileSync(new URL("./checkin.css", import.meta.url), "utf8")).filter((r) => r.at.length === 0);
// The declarations of every rule with exactly this selector, a later one winning.
const decls = (sel: string): Record<string, string> =>
  Object.fromEntries(rules.filter((r) => r.selectors.includes(sel)).flatMap((r) => r.decls));

describe("T18 the late banner's error row on #/checkin/student covers nothing", () => {
  it("while the banner works, its wrapper stays fixed at the bottom of the screen, so nothing moves", () => {
    const box = decls(".student-late");
    expect(box.position).toBe("fixed");
    expect(box.bottom).toBe("max(16px, calc(var(--banner-stack-space, 0px) + 8px))");
  });

  it("once the banner fails, its wrapper joins the page under the last line, 16px in from each side", () => {
    const failed = decls(".student-late:has(> .row)");
    expect(failed.position).toBe("static");
    expect(failed["margin-inline"]).toBe("16px");
    expect(failed["margin-block"]).toBe("0 16px");
  });

  it("and the phone frame stops filling the screen, so the row follows the page's last line", () => {
    expect(decls(".ph:has(~ .student-late > .row)")["min-height"]).toBe("0");
  });

  it("no rule puts the failed row back on top of the page", () => {
    const pinned = rules
      .filter((r) => r.selectors.some((s) => s.includes(".student-late") && s.includes(".row")))
      .flatMap((r) => r.decls.filter(([k, v]) => k === "position" && /fixed|sticky|absolute/.test(v)).map(() => r.selectors.join(", ")));
    expect(pinned).toEqual([]);
  });
});
