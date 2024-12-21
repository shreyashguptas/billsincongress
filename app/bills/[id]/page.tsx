import { createClient } from '@/utils/supabase/client';
import { BILL_INFO_TABLE_NAME } from '@/lib/types/BillInfo';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { notFound } from 'next/navigation';

async function getBillById(id: string) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from(BILL_INFO_TABLE_NAME)
    .select(`
      *,
      bill_subjects (
        policy_area_name
      )
    `)
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching bill:', error);
    return null;
  }

  return data;
}

type Props = {
  params: {
    id: string;
  };
  searchParams: { [key: string]: string | string[] | undefined };
};

export default async function BillPage({ params, searchParams }: Props) {
  const bill = await getBillById(params.id);

  if (!bill) {
    notFound();
  }

  return (
    <div className="container mx-auto py-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">
          {bill.bill_type_label} {bill.bill_number}
          <span className="text-xl text-muted-foreground ml-2">
            ({bill.congress}th Congress)
          </span>
        </h1>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Title</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg">{bill.title}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sponsor Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p>
                  <span className="font-medium">Name:</span>{' '}
                  {bill.sponsor_first_name} {bill.sponsor_last_name}
                </p>
                <p>
                  <span className="font-medium">Party:</span>{' '}
                  {bill.sponsor_party}
                </p>
                <p>
                  <span className="font-medium">State:</span>{' '}
                  {bill.sponsor_state}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Bill Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p>
                  <span className="font-medium">Introduced:</span>{' '}
                  {new Date(bill.introduced_date).toLocaleDateString()}
                </p>
                {bill.latest_action_text && (
                  <p>
                    <span className="font-medium">Latest Action:</span>{' '}
                    {bill.latest_action_text}
                    {bill.latest_action_date && (
                      <span className="text-muted-foreground ml-2">
                        ({new Date(bill.latest_action_date).toLocaleDateString()})
                      </span>
                    )}
                  </p>
                )}
                {bill.progress_description && (
                  <p>
                    <span className="font-medium">Current Stage:</span>{' '}
                    {bill.progress_description}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {bill.bill_subjects?.policy_area_name && (
            <Card>
              <CardHeader>
                <CardTitle>Policy Area</CardTitle>
              </CardHeader>
              <CardContent>
                <p>{bill.bill_subjects.policy_area_name}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}