import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = createClient();

  const { data: subjectsData, error: subjectsError } = await supabase
    .from('bill_subjects')
    .select('*')
    .order('id');

  if (subjectsError) {
    return NextResponse.json({ error: subjectsError.message }, { status: 500 });
  }

  return NextResponse.json({ data: subjectsData });
} 