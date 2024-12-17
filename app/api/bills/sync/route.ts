import { NextResponse } from 'next/server';
import { CongressApiService } from '@/lib/services/congress-api';
import { BillStorageService } from '@/lib/services/bill-storage';
import { headers } from 'next/headers';

// Configure the route for dynamic handling
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const headersList = headers();
    const authToken = request.headers.get('x-sync-token');

    // Check for sync token
    if (!process.env.SYNC_AUTH_TOKEN || authToken !== process.env.SYNC_AUTH_TOKEN) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized: Sync token required' },
        { status: 401 }
      );
    }

    // Verify environment variables
    if (!process.env.CONGRESS_API_KEY) {
      throw new Error('Congress API key is not configured');
    }
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      throw new Error('Supabase configuration is missing');
    }

    console.log('Starting bill sync process...');
    const congressApi = new CongressApiService();
    const storage = new BillStorageService();

    // Get sync parameters from query
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const congress = parseInt(url.searchParams.get('congress') || '0');

    // Fetch bills from Congress API
    console.log('Fetching bills from Congress API...');
    const bills = await congressApi.fetchBills(limit, congress);
    console.log(`Fetched ${bills.length} bills from Congress API`);

    if (!bills || bills.length === 0) {
      console.log('No bills were fetched from the API');
      return NextResponse.json(
        { success: false, message: 'No bills fetched from Congress API' },
        { status: 404 }
      );
    }

    // Store bills in Supabase
    console.log('Storing bills in Supabase...');
    await storage.storeBills(bills);
    console.log('Successfully stored bills in Supabase');

    return NextResponse.json({ 
      success: true, 
      message: 'Bills synced successfully',
      count: bills.length,
      bills: bills
    });
  } catch (error: any) {
    console.error('Detailed error:', {
      message: error.message,
      stack: error.stack,
      cause: error.cause
    });
    
    return NextResponse.json(
      { 
        success: false, 
        message: 'Failed to sync bills',
        error: error.message,
        details: error.stack
      },
      { status: 500 }
    );
  }
} 