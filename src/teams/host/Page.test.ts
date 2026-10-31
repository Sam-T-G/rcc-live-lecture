// @vitest-environment node
// #/host (Page.tsx) and the Points tab, rendered with every Convex query still loading and the
// professor key gate open, so the test sees the page the professor sees before the data arrives.
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import HostPage from "./Page";
import { PointsTab } from "./Boards";
import QA from "./QA";

vi.mock("convex/react", () => ({ useQuery: () => undefined, useMutation: () => vi.fn(), useAction: () => vi.fn() }));
vi.mock("../checkin/prof", () => ({ ProfGate: ({ children }: { children: ReactNode }) => children, useProfKey: () => undefined }));

const html = (type: Parameters<typeof createElement>[0]) => renderToStaticMarkup(createElement(type));

describe("#/host", () => {
  it("the header has an 'Attendance' link that opens #/checkin/teacher", () => {
    expect(html(HostPage)).toContain('<a href="#/checkin/teacher">Attendance</a>');
  });

  it("all three tabs still work as before: Now shows Ask the room and Who is missing it, Points shows Teams today and Students, Questions shows Questions from students", () => {
    const page = html(HostPage);
    for (const tab of ["Now", "Points", "Questions"]) expect(page).toContain(`>${tab}</button>`);
    expect(page).toContain("<h2>Ask the room</h2>");
    expect(page).toContain("<h2>Who is missing it</h2>");
    const points = html(PointsTab);
    expect(points).toContain("<h2>Teams today</h2>");
    expect(points).toContain("<h2>Students</h2>");
    expect(html(QA)).toContain("<h2>Questions from students</h2>");
  });
});
