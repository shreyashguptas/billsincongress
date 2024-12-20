export interface BillSummariesResponse {
  summaries: Array<{
    actionDate: string;
    actionDesc: string;
    text: string;
    updateDate: string;
    versionCode: string;
  }>;
}

export interface BillSummary {
  id: string;
  action_date: string;
  action_desc: string;
  text: string;
  update_date: string;
  version_code: string;
  created_at?: string;
  updated_at?: string;
}

export const BILL_SUMMARIES_TABLE_NAME = 'bill_summaries'; 