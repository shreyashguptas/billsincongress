import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { BILL_INFO_TABLE_NAME } from '@/lib/types/BillInfo';

export async function GET() {
  try {
    // Create Supabase admin client
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        }
      }
    );

    // Fetch all bills from the database
    const { data, error } = await supabaseAdmin
      .from(BILL_INFO_TABLE_NAME)
      .select('*')
      .order('introduced_date', { ascending: false });

    if (error) {
      console.error('Error fetching bills:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    console.log('Found bills:', data?.length || 0);
    console.log('Sample bill:', data?.[0]);

    return NextResponse.json({ 
      success: true,
      count: data?.length || 0,
      bills: data 
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ success: false, error: 'Unexpected error occurred' }, { status: 500 });
  }
} 