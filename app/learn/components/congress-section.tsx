'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import { Card } from '@/components/ui/card';

type CongressInfo = {
  title: string;
  description: string;
  totalMembers: number;
  color: string;
  details: string[];
};

const congressInfo: Record<string, CongressInfo> = {
  house: {
    title: 'House of Representatives',
    description: 'Representatives are based on state population. Larger states get more representatives to ensure fair representation.',
    totalMembers: 435,
    color: 'text-blue-500',
    details: [
      '435 voting members',
      'Representatives are assigned based on state population',
      'Elections every 2 years',
      'Led by the Speaker of the House',
    ],
  },
  senate: {
    title: 'Senate',
    description: 'Each state gets exactly two Senators, regardless of size. This ensures equal representation for all states.',
    totalMembers: 100,
    color: 'text-red-500',
    details: [
      '100 total members (2 per state)',
      'Senators serve 6-year terms',
      'One-third of seats up for election every 2 years',
      'Led by the President of the Senate (Vice President of the U.S.)',
    ],
  },
};

export function CongressSection() {
  return (
    <div className="space-y-8">
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex items-center gap-3 mb-6">
            <span className="text-2xl">🏛️</span>
            <h2 className="text-3xl font-bold">What is Congress?</h2>
          </div>

          <p className="text-xl mb-8">
            Congress is America's law-making body, where elected officials work
            together to create and pass laws that affect our daily lives.
          </p>

          <div className="grid md:grid-cols-2 gap-6 mb-12">
            {(['house', 'senate'] as const).map((chamber) => (
              <motion.div
                key={chamber}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Card className="p-6 h-full">
                  <h3 className={`text-xl font-semibold mb-3 ${congressInfo[chamber].color}`}>
                    {congressInfo[chamber].title}
                  </h3>
                  <p className="text-muted-foreground mb-4">
                    {congressInfo[chamber].description}
                  </p>
                  <div className="bg-muted p-4 rounded-lg mb-4">
                    <p className="font-semibold">Total Members: {congressInfo[chamber].totalMembers}</p>
                  </div>
                  <ul className="space-y-2">
                    {congressInfo[chamber].details.map((detail, index) => (
                      <li key={index} className="flex items-center gap-2">
                        <span className="text-primary">•</span>
                        <span className="text-sm">{detail}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              </motion.div>
            ))}
          </div>

          <div className="relative h-64 rounded-xl overflow-hidden mb-12">
            <picture>
              <source
                srcSet="/optimized/Capitol Panoramic-large.webp"
                media="(min-width: 1024px)"
                type="image/webp"
              />
              <source
                srcSet="/optimized/Capitol Panoramic.webp"
                type="image/webp"
              />
              <Image
                src="/images/Capitol Panoramic.jpg"
                alt="The U.S. Capitol Building in Washington, D.C."
                fill
                className="object-cover"
                priority
              />
            </picture>
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-4">
              <p className="text-white text-sm">The U.S. Capitol Building in Washington, D.C.</p>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">⚖️</span>
                <h4 className="text-lg font-semibold">Equal Powers</h4>
              </div>
              <p className="text-sm text-muted-foreground">
                Both chambers have equal legislative powers and must agree on bills.
              </p>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">🗳️</span>
                <h4 className="text-lg font-semibold">Regular Elections</h4>
              </div>
              <p className="text-sm text-muted-foreground">
                All members of Congress are elected by the people they represent.
              </p>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">📜</span>
                <h4 className="text-lg font-semibold">Constitutional Role</h4>
              </div>
              <p className="text-sm text-muted-foreground">
                Congress's powers are defined in Article I of the Constitution.
              </p>
            </Card>
          </div>
        </motion.div>
      </div>
    </div>
  );
} 