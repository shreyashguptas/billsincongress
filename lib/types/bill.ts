export interface Bill {
  id: string;
  congress: number;
  bill_type: string;
  bill_number: string;
  bill_type_label: string;
  introduced_date: string;
  title: string;
  sponsor_first_name: string;
  sponsor_last_name: string;
  sponsor_party: string;
  sponsor_state: string;
  progress_stage: string;
  progress_description: string;
  bill_subjects?: {
    policy_area_name: string;
  };
  latest_summary?: string;
  pdf_url?: string;
}

export interface BillQueryParams {
  page?: number;
  itemsPerPage?: number;
  status?: string;
  introducedDateFilter?: string;
  lastActionDateFilter?: string;
  sponsorFilter?: string;
  titleFilter?: string;
  stateFilter?: string;
  policyArea?: string;
  billType?: string;
} 