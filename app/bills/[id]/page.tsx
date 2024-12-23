import { notFound } from 'next/navigation';
import { createStaticClient } from '@/utils/supabase/server-app';
import { BILL_INFO_TABLE_NAME } from '@/lib/types/BillInfo';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BillProgress } from '@/components/bills/bill-progress';
import type { Bill } from '../../../lib/types/bill';
import type { Metadata } from 'next';

// Enable ISR with 1-hour revalidation
export const revalidate = 3600;

const STATE_NAMES: { [key: string]: string } = {
  'AL': 'Alabama',
  'AK': 'Alaska',
  'AZ': 'Arizona',
  'AR': 'Arkansas',
  'CA': 'California',
  'CO': 'Colorado',
  'CT': 'Connecticut',
  'DE': 'Delaware',
  'FL': 'Florida',
  'GA': 'Georgia',
  'HI': 'Hawaii',
  'ID': 'Idaho',
  'IL': 'Illinois',
  'IN': 'Indiana',
  'IA': 'Iowa',
  'KS': 'Kansas',
  'KY': 'Kentucky',
  'LA': 'Louisiana',
  'ME': 'Maine',
  'MD': 'Maryland',
  'MA': 'Massachusetts',
  'MI': 'Michigan',
  'MN': 'Minnesota',
  'MS': 'Mississippi',
  'MO': 'Missouri',
  'MT': 'Montana',
  'NE': 'Nebraska',
  'NV': 'Nevada',
  'NH': 'New Hampshire',
  'NJ': 'New Jersey',
  'NM': 'New Mexico',
  'NY': 'New York',
  'NC': 'North Carolina',
  'ND': 'North Dakota',
  'OH': 'Ohio',
  'OK': 'Oklahoma',
  'OR': 'Oregon',
  'PA': 'Pennsylvania',
  'RI': 'Rhode Island',
  'SC': 'South Carolina',
  'SD': 'South Dakota',
  'TN': 'Tennessee',
  'TX': 'Texas',
  'UT': 'Utah',
  'VT': 'Vermont',
  'VA': 'Virginia',
  'WA': 'Washington',
  'WV': 'West Virginia',
  'WI': 'Wisconsin',
  'WY': 'Wyoming',
  'DC': 'District of Columbia',
  'AS': 'American Samoa',
  'GU': 'Guam',
  'MP': 'Northern Mariana Islands',
  'PR': 'Puerto Rico',
  'VI': 'U.S. Virgin Islands'
};

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

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

export default async function BillPage({ params }: PageProps) {
  const { id } = await params;
  const data = await getBillData(id);

  if (!data) {
    notFound();
  }

  const partyFullName = {
    'D': 'Democrat',
    'R': 'Republican',
    'I': 'Independent'
  }[data.sponsor_party] || data.sponsor_party;

  const stateName = STATE_NAMES[data.sponsor_state] || data.sponsor_state;

  return (
    <div className="container mx-auto py-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Title and Bill Info */}
        <Card>
          <CardHeader>
            <CardTitle>{data.title}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {data.bill_type_label} {data.bill_number} ({data.congress}th Congress)
            </p>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Introduced on {formatDate(data.introduced_date)}
            </p>
          </CardContent>
        </Card>

        {/* Bill Status */}
        <Card>
          <CardHeader>
            <CardTitle>Current Status</CardTitle>
          </CardHeader>
          <CardContent>
            {data.progress_stage && data.progress_description && (
              <BillProgress 
                stage={data.progress_stage} 
                description={data.progress_description}
              />
            )}
          </CardContent>
        </Card>

        {/* Sponsor Information */}
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
                {partyFullName}
              </p>
              <p>
                <span className="font-medium">State:</span>{' '}
                {stateName}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Policy Area */}
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
  );
}