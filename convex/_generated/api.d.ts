/**
 * AUTO-GENERATED STUB - This file will be replaced when `npx convex dev` runs.
 * It provides type stubs so the project can build before Convex is initialized.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyFunction = (...args: any[]) => any;
type ApiModule = Record<string, AnyFunction>;

export declare const api: {
  bills: {
    getById: any;
    list: any;
    getCongressInfo: any;
    getCongressNumbers: any;
    billsByCongress: any;
    latestCongressStatus: any;
    getPolicyAreas: any;
  };
  mutations: {
    upsertBill: any;
    upsertBillActions: any;
    upsertBillSubject: any;
    upsertBillSummary: any;
    upsertBillText: any;
    upsertBillTitles: any;
    createSyncSnapshot: any;
    updateSyncSnapshot: any;
  };
  congressApi: {
    syncBillBatch: any;
    syncCongress: any;
    dailySync: any;
    initialHistoricalPull: any;
  };
  crons: any;
};

export declare const internal: typeof api;
