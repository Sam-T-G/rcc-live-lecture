// Every page, by the first part of its URL (#/lab → "lab"). App.tsx looks the first part up here
// and shows "No page at #/..." for anything else. A page reads the rest of the URL with
// useRoute() and the part after "?" with useHashParams(). Home (#/) links every route below, so a
// new one gets a line in src/pages/Home.tsx too.
//   #/                  Home
//   #/checkin/student   the student's pass (also #/checkin/join and #/checkin)
//   #/checkin/teacher   professors: scan passes with the laptop camera, attendance
//   #/checkin/kiosk     the door iPad: pairing code, then the pass scanner
//   #/checkin/quiz      professors: ask a quiz question or a vote
//   #/checkin/stage     the projector: today's deck with the check-in QR, count and quiz
//   #/live              the slide on a student's phone, the quiz, teams and questions
//   #/live/leaderboard  the team leaderboard for the projector
//   #/portal            the slide alone, paging back through slides already shown
//   #/host              professors: the professor view
//   #/admin             staff roles and door iPads
//   #/lab               every building block, one panel each
//   #/ui                the design kit, light and dark (#/ui/projector at projector size)
import { createElement, Suspense, useState, type ComponentType } from "react";
import { Link, useRoute } from "../blocks/router";
import { Screen, Status } from "../blocks/ui";
import Home from "./Home";
import Lab from "./Lab";
import { retryLazy } from "./retryLazy";
import CheckinPage from "../teams/checkin/Page";
import LivePage from "../teams/live/Page";
import HostPage from "../teams/host/Page";
import PortalPage from "../portal/Page";

// #/ui loads only when someone opens it, so phones on other pages never download the gallery.
// #/admin too: only staff open it, on a laptop. retryLazy instead of React.lazy, so after a failed
// load (a phone offline for a moment) the page boundary's Go home and a link back import the file
// again (src/pages/retryLazy.ts says why).
const pickUIKit = retryLazy(() => import("./UIKit"));
const pickAdmin = retryLazy(() => import("./Admin"));

// What a lazy page shows while its file downloads, so a slow network never shows a blank page.
// Each mount picks the page once.
function loading(pick: () => ComponentType, title: string) {
  const fallback = createElement(Screen, { title, wide: true }, createElement(Status, { kind: "loading", children: "Loading…" }));
  return function Loading() {
    const [Page] = useState(pick);
    return createElement(Suspense, { fallback }, createElement(Page));
  };
}

// A page that has nothing after its name: #/lab/nope and #/admin/x show "No page at #/...", the
// same screen App shows for an unknown first part. Pages with parts of their own (checkin, live,
// host, portal, ui) check them themselves.
function alone(Page: ComponentType) {
  return function Alone() {
    const parts = useRoute();
    if (parts.length <= 1) return createElement(Page);
    return createElement(
      Screen,
      { title: `No page at #/${parts.join("/")}` },
      createElement("p", null, createElement(Link, { to: "", children: "Go home" })),
    );
  };
}

export const pages: Record<string, ComponentType> = {
  "": Home,
  lab: alone(Lab),
  checkin: CheckinPage, // #/checkin/student (join), teacher, kiosk, quiz, stage
  live: LivePage, // #/live, #/live/leaderboard
  host: HostPage, // #/host
  portal: PortalPage, // #/portal, #/portal?channel=<name>
  ui: loading(pickUIKit, "UI kit"), // #/ui (every color and kit part, light and dark), #/ui/projector
  admin: alone(loading(pickAdmin, "Admin")), // #/admin: the staff list and the door iPads
};
