export interface BillTextResponse {
  textVersions: Array<{
    date: string;
    formats: Array<{
      type: string;
      url: string;
    }>;
    type: string;
  }>;
}

export interface BillText {
  id: string;
  date: string;
  formats_url_txt: string;
  formats_url_pdf: string;
  type: string;
  created_at?: string;
  updated_at?: string;
}

export const BILL_TEXT_TABLE_NAME = 'bill_text'; 