import { notFound } from 'next/navigation';
import { createStaticClient } from '@/utils/supabase/server-app';
import { BILL_INFO_TABLE_NAME } from '@/lib/types/BillInfo';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// Enable ISR with 1-hour revalidation
export const revalidate = 3600;

interface PageProps {
  params: Promise<{ id: string }>;
}

// Pre-generate the most recent 100 bills at build time
export async function generateStaticParams() {
  const supabase = createStaticClient();
  const { data } = await supabase
    .from(BILL_INFO_TABLE_NAME)
    .select('id')
    .order('introduced_date', { ascending: false })
    .limit(100);

  return (data || []).map((bill) => ({
    id: bill.id,
  }));
}

async function getBillData(billId: string) {
  const supabase = createStaticClient();
  const { data } = await supabase
    .from(BILL_INFO_TABLE_NAME)
    .select(`
      *,
      bill_subjects (
        policy_area_name
      )
    `)
    .match({ id: billId })
    .single();

  if (!data) {
    return null;
  }

  return data;
}

export default async function BillPage({ params }: PageProps) {
  const { id } = await params;
  const data = await getBillData(id);

  if (!data) {
    notFound();
  }

  return (
    <div className="container mx-auto py-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">
          {data.bill_type_label} {data.bill_number}
          <span className="text-xl text-muted-foreground ml-2">
            ({data.congress}th Congress)
          </span>
        </h1>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Title</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg">{data.title}</p>
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
                  {data.sponsor_first_name} {data.sponsor_last_name}
                </p>
                <p>
                  <span className="font-medium">Party:</span>{' '}
                  {data.sponsor_party}
                </p>
                <p>
                  <span className="font-medium">State:</span>{' '}
                  {data.sponsor_state}
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
                  {new Date(data.introduced_date).toLocaleDateString()}
                </p>
                {data.latest_action_text && (
                  <p>
                    <span className="font-medium">Latest Action:</span>{' '}
                    {data.latest_action_text}
                    {data.latest_action_date && (
                      <span className="text-muted-foreground ml-2">
                        ({new Date(data.latest_action_date).toLocaleDateString()})
                      </span>
                    )}
                  </p>
                )}
                {data.progress_description && (
                  <p>
                    <span className="font-medium">Current Stage:</span>{' '}
                    {data.progress_description}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {data.bill_subjects?.policy_area_name && (
            <Card>
              <CardHeader>
                <CardTitle>Policy Area</CardTitle>
              </CardHeader>
              <CardContent>
                <p>{data.bill_subjects.policy_area_name}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}