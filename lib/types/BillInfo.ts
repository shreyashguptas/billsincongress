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
  congress: number;
  bill_type: string;
  bill_number: string;
  bill_type_label: string;
  introduced_date: string;
  title: string;
  title_without_number?: string;
  sponsor_first_name: string;
  sponsor_last_name: string;
  sponsor_party: string;
  sponsor_state: string;
  progress_stage?: number;
  progress_description?: string;
  created_at?: string;
  updated_at?: string;
  bill_subjects?: {
    policy_area_name: string;
  } | null;
}

export const BILL_INFO_TABLE_NAME = 'bill_info'; 