// @vitest-environment node
// The #/checkin router (Page.tsx). Each page it opens is swapped for a stand-in that prints its
// name, so the test checks only which page each URL opens.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import CheckinPage from "./Page";

vi.mock("./Student", () => ({ Student: () => "[student pass]" }));
vi.mock("./Teacher", () => ({ Teacher: () => "[teacher scanner]" }));
vi.mock("./Kiosk", () => ({ default: () => "[door kiosk]" }));
vi.mock("./Quiz", () => ({ Professor: () => "[quiz]" }));
vi.mock("./Stage", () => ({ default: () => "[stage]" }));

function open(hash: string) {
  vi.stubGlobal("location", { hash });
  return renderToStaticMarkup(createElement(CheckinPage));
}

describe("#/checkin routes", () => {
  it("#/checkin/student, #/checkin/join, #/checkin/teacher, #/checkin/kiosk, #/checkin/quiz and #/checkin/stage load as before", () => {
    expect(open("#/checkin/student")).toBe("[student pass]");
    expect(open("#/checkin/join")).toBe("[student pass]");
    expect(open("#/checkin")).toBe("[student pass]");
    expect(open("#/checkin/join?from=qr")).toBe("[student pass]");
    expect(open("#/checkin/teacher")).toBe("[teacher scanner]");
    expect(open("#/checkin/kiosk")).toBe("[door kiosk]");
    expect(open("#/checkin/quiz")).toBe("[quiz]");
    expect(open("#/checkin/stage?bridge=gdg")).toBe("[stage]");
  });

  it("#/checkin/nope shows 'No page at #/checkin/nope' with a link home", () => {
    const html = open("#/checkin/nope");
    expect(html).toContain("<h1>No page at #/checkin/nope</h1>");
    expect(html).toContain('<a href="#/">Go home</a>');
    expect(html).not.toContain("[student pass]");
  });
});
