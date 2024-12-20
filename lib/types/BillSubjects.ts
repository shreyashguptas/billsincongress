export interface BillSubjectsResponse {
  subjects: {
    policyArea: {
      name: string;
      updateDate: string;
    };
    legislativeSubjects: Array<{
      name: string;
      updateDate: string;
    }>;
  };
}

export interface BillSubject {
  id: string;
  policy_area_name: string;
  policy_area_update_date: string;
  created_at?: string;
  updated_at?: string;
}

export const BILL_SUBJECTS_TABLE_NAME = 'bill_subjects'; 