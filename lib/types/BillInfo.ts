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
  };
}

export interface BillInfo {
  id: string;
  introduced_date: string;
  sponsor_bioguide_id: string;
  sponsor_district: number;
  sponsor_first_name: string;
  sponsor_last_name: string;
  sponsor_party: string;
  sponsor_state: string;
  sponsor_is_by_request: string;
  update_date: string;
  update_date_including_text: string;
}

export const BILL_INFO_TABLE_NAME = 'bill_info'; 