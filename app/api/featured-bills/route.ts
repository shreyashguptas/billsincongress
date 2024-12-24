import { billsService } from '@/lib/services/bills-service';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 3600; // Revalidate every hour

export async function GET() {
  try {
    const bills = await billsService.fetchFeaturedBills();
    return NextResponse.json(bills);
  } catch (error) {
    console.error('Error fetching featured bills:', error);
    return NextResponse.json(
      { error: 'Failed to fetch featured bills' },
      { status: 500 }
    );
  }
} 