// @vitest-environment node
// <BannerStack> (kit.tsx) pinned at the bottom of #/live and #/checkin/student with the sign-in
// warning (SignInEnding). It used to cover the last controls on the page ('Not you? Sign out',
// the Questions 'Post' button) with no way to scroll them out from under it
// (sweep1-core-check-1), and the late banner sat in the same spot on top of it
// (sweep1-core-fixcheck-1). These check the measuring and the stylesheets; the browser check
// signs in so the warning shows and, at 390 x 844, scrolls to the end of each page and finds
// those buttons with elementFromPoint, and shows a late arrival above the warning.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "../styles/cssRules";
import { STACK_SPACE, pinnedSpace, setStackSpace } from "./stackSpace";

const css = (path: string) => parse(readFileSync(new URL(path, import.meta.url), "utf8"));
// Every declaration of `prop` in a rule whose selector list has `selector`, in file order.
const decls = (rules: ReturnType<typeof parse>, selector: string, prop: string) =>
  rules.filter((r) => r.selectors.includes(selector)).flatMap((r) => r.decls.filter(([k]) => k === prop).map(([, v]) => v));

function fakeRoot() {
  const props = new Map<string, string>();
  return { props, style: { setProperty: (k: string, v: string) => void props.set(k, v), removeProperty: (k: string) => (props.delete(k), "") } };
}

describe("BannerStack's room at the bottom of the screen", () => {
  it("sweep1-core-check-1 a fixed stack's space is the distance from its top to the bottom of the screen", () => {
    // The check's numbers: the banner ran from y=664 to y=828 on an 844 px tall phone.
    expect(pinnedSpace({ top: 664, height: 164 }, 844, "fixed")).toBe(180);
    expect(pinnedSpace({ top: 663.2, height: 164 }, 844, "fixed")).toBe(181);
    expect(pinnedSpace({ top: 120, height: 164 }, 844, "static")).toBe(0); // #/ui shows it in place
    expect(pinnedSpace({ top: 844, height: 0 }, 844, "fixed")).toBe(0);
  });

  it("sweep1-core-check-1 the largest stack's space goes on <html> while it shows and comes off when it goes", () => {
    const root = fakeRoot();
    const a = {}, b = {};
    setStackSpace(root, a, 180);
    expect(root.props.get(STACK_SPACE)).toBe("180px");
    setStackSpace(root, b, 240);
    expect(root.props.get(STACK_SPACE)).toBe("240px");
    setStackSpace(root, b, undefined);
    expect(root.props.get(STACK_SPACE)).toBe("180px");
    setStackSpace(root, a, 0);
    expect(root.props.has(STACK_SPACE)).toBe(false);
  });

  it("sweep1-core-check-1 the page pads its bottom by the stack's space, and keyboard focus scrolls above it", () => {
    const kit = css("../styles/kit.css");
    expect(decls(kit, "body", "padding-bottom").at(-1)).toBe(`var(${STACK_SPACE}, 0px)`);
    expect(decls(kit, "html", "scroll-padding-bottom").at(-1)).toBe(`var(${STACK_SPACE}, 0px)`);
  });

  it("sweep1-core-fixcheck-1 the late banner sits above the stack while one shows, and 16 px up from the bottom otherwise", () => {
    const checkin = css("../teams/checkin/checkin.css");
    expect(decls(checkin, ".late", "bottom").at(-1)).toBe(`max(16px, calc(var(${STACK_SPACE}, 0px) + 8px))`);
  });
});
