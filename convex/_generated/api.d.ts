/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ai from "../ai.js";
import type * as checkin_attendance from "../checkin/attendance.js";
import type * as checkin_pass from "../checkin/pass.js";
import type * as checkin_prof from "../checkin/prof.js";
import type * as checkin_quiz from "../checkin/quiz.js";
import type * as checkin_read from "../checkin/read.js";
import type * as deck from "../deck.js";
import type * as dev_seed from "../dev/seed.js";
import type * as host_ai from "../host/ai.js";
import type * as host_answers from "../host/answers.js";
import type * as host_board from "../host/board.js";
import type * as host_points from "../host/points.js";
import type * as host_qa from "../host/qa.js";
import type * as host_questions from "../host/questions.js";
import type * as host_seed from "../host/seed.js";
import type * as host_teams from "../host/teams.js";
import type * as http from "../http.js";
import type * as lab from "../lab.js";
import type * as lib from "../lib.js";
import type * as live_groups from "../live/groups.js";
import type * as live_past from "../live/past.js";
import type * as live_questions from "../live/questions.js";
import type * as live_read from "../live/read.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  ai: typeof ai;
  "checkin/attendance": typeof checkin_attendance;
  "checkin/pass": typeof checkin_pass;
  "checkin/prof": typeof checkin_prof;
  "checkin/quiz": typeof checkin_quiz;
  "checkin/read": typeof checkin_read;
  deck: typeof deck;
  "dev/seed": typeof dev_seed;
  "host/ai": typeof host_ai;
  "host/answers": typeof host_answers;
  "host/board": typeof host_board;
  "host/points": typeof host_points;
  "host/qa": typeof host_qa;
  "host/questions": typeof host_questions;
  "host/seed": typeof host_seed;
  "host/teams": typeof host_teams;
  http: typeof http;
  lab: typeof lab;
  lib: typeof lib;
  "live/groups": typeof live_groups;
  "live/past": typeof live_past;
  "live/questions": typeof live_questions;
  "live/read": typeof live_read;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
