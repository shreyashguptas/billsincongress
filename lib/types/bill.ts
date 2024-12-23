export interface Bill {
  id: string;
  congress: number;
  bill_type: string;
  bill_number: number;
  bill_type_label: string;
  introduced_date: string;
  title: string;
  sponsor_first_name: string;
  sponsor_last_name: string;
  sponsor_party: string;
  sponsor_state: string;
  progress_stage: number;
  progress_description: string;
  bill_subjects?: {
    policy_area_name: string;
  };
} 