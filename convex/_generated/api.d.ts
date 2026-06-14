/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ResendOTP from "../ResendOTP.js";
import type * as ResendOTPPasswordReset from "../ResendOTPPasswordReset.js";
import type * as aggregateBackfill from "../aggregateBackfill.js";
import type * as aggregates from "../aggregates.js";
import type * as audit from "../audit.js";
import type * as auth from "../auth.js";
import type * as baseRates from "../baseRates.js";
import type * as billStage from "../billStage.js";
import type * as bills from "../bills.js";
import type * as chatAnalytics from "../chatAnalytics.js";
import type * as congressApi from "../congressApi.js";
import type * as crons from "../crons.js";
import type * as functions from "../functions.js";
import type * as http from "../http.js";
import type * as llm from "../llm.js";
import type * as mutations from "../mutations.js";
import type * as rateLimits from "../rateLimits.js";
import type * as savedBills from "../savedBills.js";
import type * as sync from "../sync.js";
import type * as syncStatus from "../syncStatus.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  ResendOTP: typeof ResendOTP;
  ResendOTPPasswordReset: typeof ResendOTPPasswordReset;
  aggregateBackfill: typeof aggregateBackfill;
  aggregates: typeof aggregates;
  audit: typeof audit;
  auth: typeof auth;
  baseRates: typeof baseRates;
  billStage: typeof billStage;
  bills: typeof bills;
  chatAnalytics: typeof chatAnalytics;
  congressApi: typeof congressApi;
  crons: typeof crons;
  functions: typeof functions;
  http: typeof http;
  llm: typeof llm;
  mutations: typeof mutations;
  rateLimits: typeof rateLimits;
  savedBills: typeof savedBills;
  sync: typeof sync;
  syncStatus: typeof syncStatus;
  users: typeof users;
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

export declare const components: {
  billsByChamber: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"billsByChamber">;
  billsByStage: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"billsByStage">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
