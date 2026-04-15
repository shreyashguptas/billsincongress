/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as aggregateBackfill from "../aggregateBackfill.js";
import type * as aggregates from "../aggregates.js";
import type * as bills from "../bills.js";
import type * as congressApi from "../congressApi.js";
import type * as crons from "../crons.js";
import type * as functions from "../functions.js";
import type * as llm from "../llm.js";
import type * as mutations from "../mutations.js";
import type * as sync from "../sync.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  aggregateBackfill: typeof aggregateBackfill;
  aggregates: typeof aggregates;
  bills: typeof bills;
  congressApi: typeof congressApi;
  crons: typeof crons;
  functions: typeof functions;
  llm: typeof llm;
  mutations: typeof mutations;
  sync: typeof sync;
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
