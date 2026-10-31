// @vitest-environment node
// HideLate (Student.tsx), rendered to HTML with a made-up query result (no backend).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { HideLate } from "./Student";

vi.mock("convex/react", () => ({ useQuery: () => false, useMutation: () => async () => null }));
vi.mock("../../blocks/auth", () => ({ SignInButton: () => null, useGoogleUser: () => ({ user: null }) }));

describe("HideLate, the late-banner opt-out", () => {
  it("its label has no .row class, so the checkbox stays beside its words (DC-1, DESIGN-design-8)", () => {
    // .row (checkin.css) is flex-wrap: wrap, which drops the words under the box on a phone.
    // The base label:has(> input[type=checkbox]) rule lays it out (surfaces.test.ts).
    const html = renderToStaticMarkup(createElement(HideLate));
    const label = /<label class="([^"]*)"><input type="checkbox"/.exec(html);
    expect(label).not.toBeNull();
    expect(label![1].split(" ")).not.toContain("row");
  });
});
