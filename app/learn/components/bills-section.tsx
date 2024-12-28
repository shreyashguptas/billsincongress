'use client';

import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Check } from 'lucide-react';

type BillType = {
  id: string;
  title: string;
  description: string;
  example: string;
  color: string;
};

const billTypes: BillType[] = [
  {
    id: 'public',
    title: 'Public Bills',
    description: 'These affect the general public and are the most common type of legislation.',
    example: 'Healthcare Reform',
    color: 'bg-blue-500/10 border-blue-500/20',
  },
  {
    id: 'private',
    title: 'Private Bills',
    description: 'These affect specific individuals, groups, or places.',
    example: 'Immigration Cases',
    color: 'bg-purple-500/10 border-purple-500/20',
  },
  {
    id: 'hr',
    title: 'House Bills (H.R.)',
    description: 'Bills that start in the House of Representatives.',
    example: 'H.R. 1234',
    color: 'bg-red-500/10 border-red-500/20',
  },
  {
    id: 's',
    title: 'Senate Bills (S.)',
    description: 'Bills that start in the Senate.',
    example: 'S. 789',
    color: 'bg-green-500/10 border-green-500/20',
  },
];

const funFacts = [
  {
    icon: '⏱️',
    title: 'Average Time',
    description: 'It takes an average of 263 days for a bill to become law, though some can take years!',
  },
  {
    icon: '📊',
    title: 'Success Rate',
    description: 'Only about 5% of bills introduced in Congress actually become law.',
  },
  {
    icon: '📚',
    title: 'Record Holder',
    description: 'The longest bill ever was the Affordable Care Act at over 2,700 pages!',
  },
];

export function BillsSection() {
  return (
    <div className="space-y-8">
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex items-center gap-3 mb-6">
            <span className="text-2xl">📜</span>
            <h2 className="text-3xl font-bold">Understanding Bills</h2>
          </div>

          <p className="text-xl mb-8">
            A bill is a proposal for a new law. Each type serves a different purpose
            and follows its own path through Congress.
          </p>

          <div className="grid md:grid-cols-2 gap-6 mb-12">
            {billTypes.map((bill) => (
              <motion.div
                key={bill.id}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Card className={`p-6 ${bill.color}`}>
                  <h3 className="text-xl font-semibold mb-3">{bill.title}</h3>
                  <p className="text-muted-foreground mb-4">{bill.description}</p>
                  <div className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-green-500" />
                    <span>Example: {bill.example}</span>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>

          <div className="bg-muted p-6 rounded-lg mb-12">
            <h3 className="text-xl font-semibold mb-4">Bill Status Explained</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-3 h-3 rounded-full bg-blue-500" />
                <p>Introduced - The bill begins its journey</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <p>In Committee - Being studied and revised</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-3 h-3 rounded-full bg-purple-500" />
                <p>Passed One Chamber - Approved by House or Senate</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <p>Passed Both Chambers - Ready for President</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <p>Failed/Vetoed - Bill did not become law</p>
              </div>
            </div>
          </div>

          <h3 className="text-2xl font-semibold mb-6">Fun Facts About Bills</h3>
          <div className="grid md:grid-cols-3 gap-6">
            {funFacts.map((fact, index) => (
              <motion.div
                key={index}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Card className="p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-2xl">{fact.icon}</span>
                    <h4 className="text-lg font-semibold">{fact.title}</h4>
                  </div>
                  <p className="text-sm text-muted-foreground">{fact.description}</p>
                </Card>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
} 