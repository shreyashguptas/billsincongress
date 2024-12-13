import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import Link from 'next/link';
import { BillStorageService } from '@/lib/services/bill-storage';

async function getFeaturedBills() {
  const storage = new BillStorageService();
  return storage.getBills(5); // Fetch 5 most recent bills from Supabase
}

export async function FeaturedBills() {
  const bills = await getFeaturedBills();

  return (
    <div className="mx-auto max-w-[1200px]">
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {bills.map((bill) => (
          <Link href={`/bills/${bill.id}`} key={bill.id}>
            <Card className="h-full transition-shadow hover:shadow-lg">
              <CardHeader>
                <CardTitle className="line-clamp-2 text-lg">{bill.title}</CardTitle>
                <div className="flex flex-wrap gap-2">
                  {bill.tags.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Sponsor</p>
                    <p className="font-medium">{bill.sponsorName}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Status</p>
                    <p className="font-medium">{bill.status}</p>
                  </div>
                  <div>
                    <p className="mb-2 text-sm text-muted-foreground">Progress</p>
                    <Progress value={bill.progress} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}