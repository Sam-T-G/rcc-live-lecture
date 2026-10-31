// @vitest-environment node
// Home (#/): a link to every page, grouped by who uses it, each with a line that says what the page
// does (blocks-frontend-12, rt-19). Every link is a quiet button on its own line, so it's 48px tall
// to tap on a phone (docs/design.md, Student phone).
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Home from "./Home";
import { pages } from "./index";

const html = renderToStaticMarkup(createElement(Home));
const links = [...html.matchAll(/<a\b([^>]*)>([^<]*)<\/a>/g)].map((m) => ({
  attrs: m[1],
  text: m[2],
  to: /href="#\/([^"]*)"/.exec(m[1])?.[1] ?? "",
}));

// Every route: each page in src/pages/index.ts but Home, and the parts of the team pages that are
// pages of their own (src/teams/checkin/Page.tsx, src/teams/live/Page.tsx). #/checkin/join is
// #/checkin/student by another name.
const ROUTES = [
  "checkin/student",
  "live",
  "portal",
  "checkin/teacher",
  "checkin/quiz",
  "host",
  "admin",
  "checkin/stage",
  "live/leaderboard",
  "checkin/kiosk",
  "lab",
  "ui",
];

// The parts the team pages route, read from their source: each `case "<part>":` in
// src/teams/checkin/Page.tsx and each `part === "<part>"` in src/teams/live/Page.tsx. A new part
// with no line on Home fails the test below (APP-risk-3).
const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const checkinParts = [...source("../teams/checkin/Page.tsx").matchAll(/case "([^"]+)":/g)].map((m) => m[1]);
const liveParts = [...source("../teams/live/Page.tsx").matchAll(/part === "([^"]+)"/g)].map((m) => m[1]);

describe("Home", () => {
  it("blocks-frontend-12 links every route, #/portal, the teacher scanner, the quiz, the projector and the team board included", () => {
    expect(links.map((l) => l.to)).toEqual(ROUTES);
    for (const name of Object.keys(pages).filter(Boolean)) expect(links.some((l) => l.to.split("/")[0] === name)).toBe(true);
  });

  it("APP-risk-3 links every part the check-in and live pages route (join is student by another name)", () => {
    // So a page that stops routing with `case` or `part ===` fails here instead of finding nothing.
    expect(checkinParts).toEqual(expect.arrayContaining(["student", "join", "teacher", "kiosk", "quiz", "stage"]));
    expect(liveParts).toEqual(["leaderboard"]);
    const routed = [...checkinParts.filter((p) => p !== "join").map((p) => `checkin/${p}`), ...liveParts.map((p) => `live/${p}`)];
    for (const route of routed) expect(links.map((l) => l.to), `Home has no line for #/${route}`).toContain(route);
  });

  it("blocks-frontend-12 groups them for students, professors, the projector and door, and people building the app", () => {
    expect([...html.matchAll(/<h2>([^<]*)<\/h2>/g)].map((m) => m[1])).toEqual(["Students", "Professors", "Projector and door", "Building the app"]);
    expect(links.slice(0, 3).map((l) => l.text)).toEqual(["Check in", "Follow the slides", "Slides only"]);
    expect(html).toContain("<p>Sign in with the Google account an admin added on #/admin.</p>");
  });

  it("rt-19 each line says what the page does now: the door iPad scans the pass, no door code, no professor key", () => {
    expect(html).not.toMatch(/code at the door|after scanning|Hosts only|professor key|when you.re lost/i);
    expect(html).toContain("Sign in and get your pass for the door.");
    expect(html).toContain("The iPad shows a 6-digit code. Type it on #/admin once, and the iPad scans passes.");
  });

  it("lists every page as a quiet button link whose words line up with the line under it (btn--flush, DCHK-3)", () => {
    for (const l of links) expect(l.attrs).toMatch(/class="btn btn--quiet btn--flush"/);
  });

  it("puts each description on its own line, not beside the link", () => {
    expect(html).not.toMatch(/<\/a> ·/);
    expect(html.match(/<div class="muted">/g)).toHaveLength(links.length);
  });
});
