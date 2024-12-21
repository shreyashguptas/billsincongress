import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST() {
  // Create a Supabase client with the service role key
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  // First, let's try to delete any existing data
  const { error: deleteError } = await supabaseAdmin
    .from('bill_subjects')
    .delete()
    .neq('id', '0'); // Delete all records

  if (deleteError) {
    console.error('Error deleting existing data:', deleteError);
  }

  const testData = [
    {
      id: '1hr118', // Lower Energy Costs Act
      policy_area_name: 'Energy',
      policy_area_update_date: new Date().toISOString()
    },
    {
      id: '2hr118', // Secure the Border Act of 2023
      policy_area_name: 'Immigration',
      policy_area_update_date: new Date().toISOString()
    },
    {
      id: '5hr118', // Parents Bill of Rights Act
      policy_area_name: 'Education',
      policy_area_update_date: new Date().toISOString()
    },
    {
      id: '7hr118', // No Taxpayer Funding for Abortion...
      policy_area_name: 'Health',
      policy_area_update_date: new Date().toISOString()
    }
  ];

  // Try to insert each record individually
  const results = [];
  for (const record of testData) {
    const { data, error } = await supabaseAdmin
      .from('bill_subjects')
      .insert(record)
      .select()
      .single();

    if (error) {
      console.error(`Error inserting record for bill ${record.id}:`, error);
    } else {
      results.push(data);
    }
  }

  return NextResponse.json({ 
    message: `Attempted to insert ${testData.length} records`,
    successfulInserts: results.length,
    data: results
  });
} 