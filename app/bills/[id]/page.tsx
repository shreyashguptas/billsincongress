import { notFound } from 'next/navigation';
import { createStaticClient } from '@/utils/supabase/server-app';
import { BILL_INFO_TABLE_NAME } from '@/lib/types/BillInfo';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Bill } from '../../../lib/types/bill';
import type { Metadata } from 'next';

// Enable ISR with 1-hour revalidation
export const revalidate = 3600;

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

async function getBillData(billId: string): Promise<Bill | null> {
  const supabase = createStaticClient();
  const { data } = await supabase
    .from(BILL_INFO_TABLE_NAME)
    .select(`
      id,
      congress,
      bill_type,
      bill_number,
      bill_type_label,
      introduced_date,
      title,
      sponsor_first_name,
      sponsor_last_name,
      sponsor_party,
      sponsor_state,
      progress_stage,
      progress_description,
      bill_subjects (
        policy_area_name
      )
    `)
    .match({ id: billId })
    .single();

  if (!data) {
    return null;
  }

  // Transform the data to match the Bill interface
  return {
    ...data,
    bill_subjects: data.bill_subjects?.[0] || undefined
  } as Bill;
}

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params;
  const data = await getBillData(id);

  if (!data) {
    return {
      title: 'Bill Not Found',
    };
  }

  return {
    title: `${data.bill_type_label} ${data.bill_number} - ${data.congress}th Congress`,
    description: data.title,
  };
}

interface PageProps {
  params: Promise<{ id: string }>;
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