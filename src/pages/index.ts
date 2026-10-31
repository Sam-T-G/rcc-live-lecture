// Every page, by the first part of its URL (#/lab → "lab"). The three team pages are
// registered already, so no team edits this file during the meeting: each team builds in
// its own src/teams/<team>/Page.tsx and reads the rest of the URL with useRoute().
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
  checkin: CheckinPage, // #/checkin/kiosk, #/checkin/join
  live: LivePage, // #/live
  host: HostPage, // #/host
  portal: PortalPage, // #/portal, #/portal?channel=<name>
  ui: () => createElement(Suspense, null, createElement(UIKit)), // #/ui (every color and kit part, light and dark), #/ui/projector
  admin: () => createElement(Suspense, null, createElement(Admin)), // #/admin: the staff list and the door iPads
};
