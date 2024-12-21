import { createClient } from '@/utils/supabase/server';
import { BILL_INFO_TABLE_NAME } from '@/lib/types/BillInfo';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { notFound } from 'next/navigation';
import React from 'react';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

interface PageProps {
  params: { id: string };
  searchParams: { [key: string]: string | string[] | undefined };
}

export default async function BillPage({ params }: PageProps) {
  if (!params?.id) {
    notFound();
  }

  const supabase = createClient();
  
  try {
    const { data, error } = await supabase
      .from(BILL_INFO_TABLE_NAME)
      .select(`
        *,
        bill_subjects (
          policy_area_name
        )
      `)
      .eq('id', params.id)
      .single();

    if (error) {
      console.error('Error fetching bill:', error);
      return (
        <div className="container mx-auto py-8">
          <h1 className="text-2xl font-bold mb-6">Bill Details</h1>
          <p className="text-muted-foreground">Error loading bill details.</p>
        </div>
      );
    }

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
  } catch (error) {
    console.error('Error in BillPage:', error);
    return (
      <div className="container mx-auto py-8">
        <h1 className="text-2xl font-bold mb-6">Bill Details</h1>
        <p className="text-muted-foreground">Error loading bill details.</p>
      </div>
    );
  }
}