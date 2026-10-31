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
import { createElement, lazy, Suspense, type ComponentType } from "react";
import Home from "./Home";
import Lab from "./Lab";
import CheckinPage from "../teams/checkin/Page";
import LivePage from "../teams/live/Page";
import HostPage from "../teams/host/Page";
import PortalPage from "../portal/Page";

// #/ui loads only when someone opens it, so phones on other pages never download the gallery.
const UIKit = lazy(() => import("./UIKit"));
// #/admin too: only staff open it, on a laptop.
const Admin = lazy(() => import("./Admin"));

export const pages: Record<string, ComponentType> = {
  "": Home,
  lab: Lab,
  checkin: CheckinPage, // #/checkin/student (join), teacher, kiosk, quiz, stage
  live: LivePage, // #/live, #/live/leaderboard
  host: HostPage, // #/host
  portal: PortalPage, // #/portal, #/portal?channel=<name>
  ui: () => createElement(Suspense, null, createElement(UIKit)), // #/ui (every color and kit part, light and dark), #/ui/projector
  admin: () => createElement(Suspense, null, createElement(Admin)), // #/admin: the staff list and the door iPads
};
