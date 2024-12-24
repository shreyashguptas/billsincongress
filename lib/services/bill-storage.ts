import { createClient } from '@/utils/supabase/server';
import { BillInfo, BillInfoResponse, BILL_INFO_TABLE_NAME } from '@/lib/types/BillInfo';
import { BillStages } from '@/lib/utils/bill-stages';
import { Bill } from '@/lib/types/bill';

export class BillStorageService {
  async getBillById(id: string): Promise<BillInfo[]> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from(BILL_INFO_TABLE_NAME)
      .select(`
        id,
        congress,
        bill_type,
        bill_number,
        bill_type_label,
        introduced_date,
        sponsor_first_name,
        sponsor_last_name,
        sponsor_party,
        sponsor_state,
        progress_stage,
        progress_description,
        bill_titles (
          title,
          title_type,
          update_date
        )
      `)
      .eq('id', id);

    if (error) {
      console.error('Error fetching bill:', error);
      throw error;
    }

    if (!data || data.length === 0) {
      return [];
    }

    // Process the data to get the latest title
    return data.map(bill => {
      const latestTitle = bill.bill_titles?.reduce((latest: any, current: any) => {
        if (!latest || new Date(current.update_date) > new Date(latest.update_date)) {
          return current;
        }
        return latest;
      }, null);

      return {
        ...bill,
        congress: bill.congress,
        bill_type: bill.bill_type,
        bill_number: bill.bill_number,
        bill_type_label: bill.bill_type_label,
        title: latestTitle?.title || 'Untitled',
        bill_titles: undefined
      };
    });
  }

  async saveBill(bill: any): Promise<void> {
    console.log('Saving bill:', JSON.stringify(bill, null, 2));
    const supabase = createClient();

    const billInfo: BillInfo = {
      id: `${bill.congress}-${bill.type}-${bill.number}`,
      congress: bill.congress,
      bill_type: bill.type,
      bill_number: bill.number,
      bill_type_label: this.getBillTypeLabel(bill.type),
      introduced_date: bill.introducedDate,
      title: bill.title || '',
      sponsor_first_name: bill.sponsors?.[0]?.firstName,
      sponsor_last_name: bill.sponsors?.[0]?.lastName,
      sponsor_party: bill.sponsors?.[0]?.party,
      sponsor_state: bill.sponsors?.[0]?.state,
      progress_stage: BillStages.INTRODUCED,
      progress_description: ''
    };

    console.log('Transformed bill info:', JSON.stringify(billInfo, null, 2));

    const { data, error } = await supabase
      .from(BILL_INFO_TABLE_NAME)
      .upsert(billInfo)
      .select();

    if (error) {
      console.error('Error saving bill:', error);
      throw error;
    }

    console.log('Successfully saved bill. Response:', JSON.stringify(data, null, 2));
  }

  private getBillTypeLabel(type: string): string {
    const labels: { [key: string]: string } = {
      hr: 'H.R.',
      s: 'S.',
      hjres: 'H.J.Res.',
      sjres: 'S.J.Res.',
      hconres: 'H.Con.Res.',
      sconres: 'S.Con.Res.',
      hres: 'H.Res.',
      sres: 'S.Res.'
    };
    return labels[type.toLowerCase()] || type;
  }

  createEmptyBill(): Bill {
    return {
      id: '',
      congress: 0,
      bill_type: '',
      bill_number: '',
      bill_type_label: '',
      introduced_date: new Date().toISOString(),
      title: '',
      sponsor_first_name: '',
      sponsor_last_name: '',
      sponsor_party: '',
      sponsor_state: '',
      progress_stage: BillStages.INTRODUCED,
      progress_description: '',
      bill_subjects: { policy_area_name: '' },
      latest_summary: '',
      pdf_url: ''
    };
  }
} 