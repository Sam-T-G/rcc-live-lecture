// @vitest-environment node
// <GroupBadge /> (Leaderboard.tsx) puts a checked-in student with no team onto one with
// live.groups.join. It must wait until Convex says the client is signed in: right after a sign-in,
// useGoogleUser already has the user while Convex still sends the old (signed-out) token, and join
// then fails with "Sign in first." (UC-check-3). No DOM here, so useEffect runs its callback during
// the render, which is enough to see whether join is called.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GroupBadge } from "./Leaderboard";

const state = vi.hoisted(() => ({ authed: false, user: null as unknown, team: null as unknown, joins: 0 }));
vi.mock("react", async (orig) => {
  const R = await orig<typeof import("react")>();
  return { ...R, useEffect: (fn: () => void) => void fn() };
});
vi.mock("convex/react", () => ({
  useQuery: () => state.team,
  useMutation: () => async () => {
    state.joins++;
    return null;
  },
  useConvexAuth: () => ({ isLoading: false, isAuthenticated: state.authed }),
}));
vi.mock("../../blocks/auth", () => ({ useGoogleUser: () => ({ user: state.user }) }));
vi.mock("../../blocks/deck", () => ({ CHANNEL: "gdg" }));

const render = () => renderToStaticMarkup(createElement(GroupBadge));

beforeEach(() => {
  Object.assign(state, { authed: false, user: { name: "Sample student 1" }, team: null, joins: 0 });
});

describe("GroupBadge joins a team only once Convex has the sign-in", () => {
  it("UC-check-3 the tab has a user but Convex isn't signed in yet: no join", () => {
    render();
    expect(state.joins).toBe(0);
  });

  it("UC-check-3 Convex is signed in and the student has no team: join once per render", () => {
    state.authed = true;
    render();
    expect(state.joins).toBe(1);
  });

  it("a student already on a team: no join, and the badge names the team", () => {
    Object.assign(state, { authed: true, team: { color: "red", label: "Red" } });
    expect(render()).toContain("You’re on Red");
    expect(state.joins).toBe(0);
  });
});
