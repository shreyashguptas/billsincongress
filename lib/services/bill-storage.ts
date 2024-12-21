import { createClient } from '@/utils/supabase/server';
import { BillInfo, BillInfoResponse, BILL_INFO_TABLE_NAME } from '@/lib/types/BillInfo';

export class BillStorageService {
  async getBillById(id: string): Promise<BillInfo[]> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from(BILL_INFO_TABLE_NAME)
      .select(`
        id,
        introduced_date,
        sponsor_first_name,
        sponsor_last_name,
        sponsor_party,
        sponsor_state,
        latest_action_code,
        latest_action_date,
        latest_action_text,
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
      introduced_date: bill.introducedDate,
      title: bill.title || '',
      sponsor_first_name: bill.sponsors?.[0]?.firstName,
      sponsor_last_name: bill.sponsors?.[0]?.lastName,
      sponsor_party: bill.sponsors?.[0]?.party,
      sponsor_state: bill.sponsors?.[0]?.state,
      latest_action_date: bill.latestAction?.actionDate,
      latest_action_text: bill.latestAction?.text,
      progress_stage: this.calculateProgressStage(bill),
      progress_description: this.getProgressDescription(bill)
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

  private calculateProgressStage(bill: any): number {
    // Default to "Introduced" stage
    let stage = 20;

    const actionText = bill.latestAction?.text?.toLowerCase() || '';
    if (actionText.includes('signed by president') || actionText.includes('became public law')) {
      stage = 100; // Enacted
    } else if (actionText.includes('passed senate') && actionText.includes('passed house')) {
      stage = 80; // Passed Both Chambers
    } else if (actionText.includes('passed senate') || actionText.includes('passed house')) {
      stage = 60; // Passed One Chamber
    } else if (actionText.includes('reported')) {
      stage = 40; // Reported
    }

    return stage;
  }

  private getProgressDescription(bill: any): string {
    const stage = this.calculateProgressStage(bill);
    switch (stage) {
      case 100:
        return 'Enacted';
      case 80:
        return 'Passed Both Chambers';
      case 60:
        return 'Passed One Chamber';
      case 40:
        return 'Reported';
      default:
        return 'Introduced';
    }
  }
} 