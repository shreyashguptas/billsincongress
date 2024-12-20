export interface BillActionsResponse {
  actions: Array<{
    actionCode: string;
    actionDate: string;
    sourceSystem: {
      code: number;
      name: string;
    };
    text: string;
    type: string;
  }>;
}

export interface BillAction {
  id: string;
  action_code: string;
  action_date: string;
  source_system_code: number;
  source_system_name: string;
  text: string;
  type: string;
  created_at?: string;
  updated_at?: string;
}

export const BILL_ACTIONS_TABLE_NAME = 'bill_actions'; 