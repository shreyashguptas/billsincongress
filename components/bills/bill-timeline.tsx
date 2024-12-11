'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function BillTimeline() {
  const events = [
    {
      date: '2024-03-15',
      title: 'Introduced in House',
      description: 'Bill introduced in House of Representatives',
    },
    {
      date: '2024-03-20',
      title: 'Referred to Committee',
      description: 'Referred to the House Committee on Energy and Commerce',
    },
    {
      date: '2024-04-05',
      title: 'Committee Hearing',
      description: 'Hearing held by the Subcommittee on Energy',
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bill Timeline</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative space-y-4">
          {events.map((event, index) => (
            <div key={index} className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className="h-2 w-2 rounded-full bg-primary" />
                {index !== events.length - 1 && (
                  <div className="h-full w-px bg-border" />
                )}
              </div>
              <div className="space-y-1 pb-4">
                <p className="text-sm text-muted-foreground">{event.date}</p>
                <p className="font-medium">{event.title}</p>
                <p className="text-sm text-muted-foreground">
                  {event.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}