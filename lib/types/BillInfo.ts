export interface BillInfoResponse {
  bill: {
    introducedDate: string;
    sponsors: Array<{
      bioguideId: string;
      district: number;
      firstName: string;
      lastName: string;
      party: string;
      state: string;
      isByRequest: string;
    }>;
    updateDate: string;
    updateDateIncludingText: string;
    number: string;
    type: string;
    congress: number;
    title?: string;
  };
}

export interface BillInfo {
  id: string;
  introduced_date: string;
  title: string;
  sponsor_first_name?: string;
  sponsor_last_name?: string;
  sponsor_party?: string;
  sponsor_state?: string;
  latest_action_code?: string;
  latest_action_date?: string;
  latest_action_text?: string;
  progress_stage?: number;
  progress_description?: string;
  created_at?: string;
  updated_at?: string;
}

export const BILL_INFO_TABLE_NAME = 'bill_info'; 