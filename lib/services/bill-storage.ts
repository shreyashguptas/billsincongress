import { createClient } from '@/utils/supabase/client';
import { BillInfo, BillInfoResponse, BILL_INFO_TABLE_NAME } from '@/lib/types/BillInfo';

export class BillStorageService {
  private supabase;

  constructor() {
    this.supabase = createClient();
  }

  async storeBills(bills: BillInfoResponse[]): Promise<void> {
    try {
      const transformedBills = bills.map(this.transformBill);
      
      const { error } = await this.supabase
        .from(BILL_INFO_TABLE_NAME)
        .upsert(transformedBills, {
          onConflict: 'id',
          ignoreDuplicates: false
        });

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error('Error storing bills:', error);
      throw error;
    }
  }

  async getBillById(id: string): Promise<BillInfo[]> {
    try {
      const { data, error } = await this.supabase
        .from(BILL_INFO_TABLE_NAME)
        .select('*')
        .eq('id', id);

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching bill by ID:', error);
      throw error;
    }
  }

  private transformBill(bill: BillInfoResponse): BillInfo {
    const sponsor = bill.bill.sponsors[0] || {};
    return {
      id: `${bill.bill.congress}-${bill.bill.type}-${bill.bill.number}`,
      congress: bill.bill.congress,
      bill_type: bill.bill.type,
      bill_number: bill.bill.number,
      title: bill.bill.title || '',
      bill_type_label: bill.bill.type || '',
      introduced_date: bill.bill.introducedDate,
      sponsor_first_name: sponsor.firstName || '',
      sponsor_last_name: sponsor.lastName || '',
      sponsor_party: sponsor.party || '',
      sponsor_state: sponsor.state || '',
      latest_action_date: bill.bill.updateDate,
      latest_action_text: bill.bill.updateDateIncludingText,
      progress_stage: 20, // Default to "Introduced" stage
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }
} 