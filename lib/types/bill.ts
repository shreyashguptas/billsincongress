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
  progress_stage: number;
  progress_description: string;
  /** The day it reached its current stage (became law, was vetoed…). Sorts the stage hubs. */
  stage_date?: string;
  /** Date of its most recent action. Sorts the topic and chamber hubs. */
  latest_action_date?: string;
  bill_subjects?: {
    policy_area_name: string;
  };
  latest_summary?: string;
  pdf_url?: string;
  // Committee base-rate context (detail page only; present only for bills still
  // in committee with enough historical data). See convex/baseRates.ts.
  base_rate_percent?: number;
  base_rate_sample?: number;
  days_in_committee?: number;
}
