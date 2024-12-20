export interface BillTitlesResponse {
  titles: Array<{
    title: string;
    titleType: string;
    titleTypeCode: number;
    updateDate: string;
    billTextVersionCode?: string;
    billTextVersionName?: string;
    chamberCode?: string;
    chamberName?: string;
  }>;
}

export interface BillTitle {
  id: string;
  title: string;
  title_type: string;
  title_type_code: number;
  update_date: string;
  bill_text_version_code?: string;
  bill_text_version_name?: string;
  chamber_code?: string;
  chamber_name?: string;
  created_at?: string;
  updated_at?: string;
}

export const BILL_TITLES_TABLE_NAME = 'bill_titles'; 