'use client';

import { useEffect, useState } from 'react';
import { BillCard } from './bill-card';
import { billsService } from '@/lib/services/bills-service';
import type { BillInfo } from '@/lib/types/BillInfo';

export function FeaturedBills() {
  const [bills, setBills] = useState<BillInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;

    const fetchFeaturedBills = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const response = await billsService.fetchFeaturedBills();
        
        if (!mounted) return;

        if (response.error) {
          throw response.error;
        }
        
        setBills(response.data);
      } catch (err) {
        if (!mounted) return;
        console.error('Error fetching featured bills:', err);
        setError(err as Error);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    fetchFeaturedBills();

    return () => {
      mounted = false;
    };
  }, []);

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <h2 className="text-2xl font-bold mb-6">Featured Bills</h2>
        <div className="animate-pulse space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-32 bg-gray-200 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto py-8">
        <h2 className="text-2xl font-bold mb-6">Featured Bills</h2>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-600">Error loading featured bills. Please try again later.</p>
        </div>
      </div>
    );
  }

  if (bills.length === 0) {
    return (
      <div className="container mx-auto py-8">
        <h2 className="text-2xl font-bold mb-6">Featured Bills</h2>
        <p className="text-muted-foreground">No featured bills available.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <h2 className="text-2xl font-bold mb-6">Featured Bills</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {bills.map((bill) => (
          <BillCard key={bill.id} bill={bill} />
        ))}
      </div>
    </div>
  );
} 