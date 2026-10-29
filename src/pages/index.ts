// Every page, by the first part of its URL (#/lab → "lab"). The three team pages are
// registered already, so no team edits this file during the meeting: each team builds in
// its own src/teams/<team>/Page.tsx and reads the rest of the URL with useRoute().
import type { ComponentType } from "react";
import Home from "./Home";
import Lab from "./Lab";
import CheckinPage from "../teams/checkin/Page";
import LivePage from "../teams/live/Page";
import HostPage from "../teams/host/Page";

export const pages: Record<string, ComponentType> = {
  "": Home,
  lab: Lab,
  checkin: CheckinPage, // #/checkin/kiosk, #/checkin/join
  live: LivePage, // #/live
  host: HostPage, // #/host
};
