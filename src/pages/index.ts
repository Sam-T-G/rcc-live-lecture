// Every page, by the first part of its URL (#/lab → "lab"). To add a page: make
// src/pages/YourPage.tsx with a default export, then add one line here.
import type { ComponentType } from "react";
import Home from "./Home";
import Lab from "./Lab";

export const pages: Record<string, ComponentType> = {
  "": Home,
  lab: Lab,
};
