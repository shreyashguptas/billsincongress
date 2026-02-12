/**
 * AUTO-GENERATED STUB - This file will be replaced when `npx convex dev` runs.
 * It provides runtime stubs so the project can build before Convex is initialized.
 */

// These are placeholder function references.
// They will be replaced with real Convex function references when codegen runs.
function makeFunctionReference(path) {
  return path;
}

const bills = {
  getById: makeFunctionReference("bills:getById"),
  list: makeFunctionReference("bills:list"),
  getCongressInfo: makeFunctionReference("bills:getCongressInfo"),
  getCongressNumbers: makeFunctionReference("bills:getCongressNumbers"),
  billsByCongress: makeFunctionReference("bills:billsByCongress"),
  latestCongressStatus: makeFunctionReference("bills:latestCongressStatus"),
  getPolicyAreas: makeFunctionReference("bills:getPolicyAreas"),
};

const mutations = {
  upsertBill: makeFunctionReference("mutations:upsertBill"),
  upsertBillActions: makeFunctionReference("mutations:upsertBillActions"),
  upsertBillSubject: makeFunctionReference("mutations:upsertBillSubject"),
  upsertBillSummary: makeFunctionReference("mutations:upsertBillSummary"),
  upsertBillText: makeFunctionReference("mutations:upsertBillText"),
  upsertBillTitles: makeFunctionReference("mutations:upsertBillTitles"),
  createSyncSnapshot: makeFunctionReference("mutations:createSyncSnapshot"),
  updateSyncSnapshot: makeFunctionReference("mutations:updateSyncSnapshot"),
};

const congressApi = {
  syncBillBatch: makeFunctionReference("congressApi:syncBillBatch"),
  syncCongress: makeFunctionReference("congressApi:syncCongress"),
  dailySync: makeFunctionReference("congressApi:dailySync"),
  initialHistoricalPull: makeFunctionReference("congressApi:initialHistoricalPull"),
};

module.exports = {
  api: { bills, mutations, congressApi },
  internal: { bills, mutations, congressApi },
};
