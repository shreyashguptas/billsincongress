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
import type * as answer from "../answer.js";
import type * as auth from "../auth.js";
import type * as baseRates from "../baseRates.js";
import type * as billStage from "../billStage.js";
import type * as bills from "../bills.js";
import type * as catalog_answerSanitize from "../catalog/answerSanitize.js";
import type * as catalog_billsIndex from "../catalog/billsIndex.js";
import type * as catalog_cite from "../catalog/cite.js";
import type * as catalog_completeness from "../catalog/completeness.js";
import type * as catalog_congressCalendar from "../catalog/congressCalendar.js";
import type * as catalog_context from "../catalog/context.js";
import type * as catalog_datasets from "../catalog/datasets.js";
import type * as catalog_fetch from "../catalog/fetch.js";
import type * as catalog_filters from "../catalog/filters.js";
import type * as catalog_measureType from "../catalog/measureType.js";
import type * as catalog_sponsorName from "../catalog/sponsorName.js";
import type * as catalog_stageSemantics from "../catalog/stageSemantics.js";
import type * as catalog_tools from "../catalog/tools.js";
import type * as catalog_types from "../catalog/types.js";
import type * as chamber from "../chamber.js";
import type * as chatAnalytics from "../chatAnalytics.js";
import type * as chats from "../chats.js";
import type * as congressApi from "../congressApi.js";
import type * as crons from "../crons.js";
import type * as functions from "../functions.js";
import type * as http from "../http.js";
import type * as indexNow from "../indexNow.js";
import type * as indexNowStatus from "../indexNowStatus.js";
import type * as llm from "../llm.js";
import type * as mutations from "../mutations.js";
import type * as policyAreaBackfill from "../policyAreaBackfill.js";
import type * as rateLimits from "../rateLimits.js";
import type * as savedBills from "../savedBills.js";
import type * as searchQuery from "../searchQuery.js";
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
  answer: typeof answer;
  auth: typeof auth;
  baseRates: typeof baseRates;
  billStage: typeof billStage;
  bills: typeof bills;
  "catalog/answerSanitize": typeof catalog_answerSanitize;
  "catalog/billsIndex": typeof catalog_billsIndex;
  "catalog/cite": typeof catalog_cite;
  "catalog/completeness": typeof catalog_completeness;
  "catalog/congressCalendar": typeof catalog_congressCalendar;
  "catalog/context": typeof catalog_context;
  "catalog/datasets": typeof catalog_datasets;
  "catalog/fetch": typeof catalog_fetch;
  "catalog/filters": typeof catalog_filters;
  "catalog/measureType": typeof catalog_measureType;
  "catalog/sponsorName": typeof catalog_sponsorName;
  "catalog/stageSemantics": typeof catalog_stageSemantics;
  "catalog/tools": typeof catalog_tools;
  "catalog/types": typeof catalog_types;
  chamber: typeof chamber;
  chatAnalytics: typeof chatAnalytics;
  chats: typeof chats;
  congressApi: typeof congressApi;
  crons: typeof crons;
  functions: typeof functions;
  http: typeof http;
  indexNow: typeof indexNow;
  indexNowStatus: typeof indexNowStatus;
  llm: typeof llm;
  mutations: typeof mutations;
  policyAreaBackfill: typeof policyAreaBackfill;
  rateLimits: typeof rateLimits;
  savedBills: typeof savedBills;
  searchQuery: typeof searchQuery;
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
