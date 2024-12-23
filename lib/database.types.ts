export interface Database {
  public: {
    Tables: {
      bill_info: {
        Row: {
          id: string;
          congress: number;
          bill_type: string;
          bill_number: string;
          title: string;
          title_without_number: string | null;
          bill_type_label: string;
          introduced_date: string;
          sponsor_first_name: string;
          sponsor_last_name: string;
          sponsor_party: string;
          sponsor_state: string;
          progress_stage: number | null;
          progress_description: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          congress: number;
          bill_type: string;
          bill_number: string;
          title: string;
          title_without_number?: string | null;
          bill_type_label: string;
          introduced_date: string;
          sponsor_first_name: string;
          sponsor_last_name: string;
          sponsor_party: string;
          sponsor_state: string;
          progress_stage?: number | null;
          progress_description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          congress?: number;
          bill_type?: string;
          bill_number?: string;
          title?: string;
          title_without_number?: string | null;
          bill_type_label?: string;
          introduced_date?: string;
          sponsor_first_name?: string;
          sponsor_last_name?: string;
          sponsor_party?: string;
          sponsor_state?: string;
          progress_stage?: number | null;
          progress_description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
  };
} 