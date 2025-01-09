'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import { Card } from '@/components/ui/card';
import { useState } from 'react';
import { Tooltip } from '@/components/ui/tooltip';
import USMap from './us-map';

type CongressInfo = {
  title: string;
  description: string;
  totalMembers: number;
  color: string;
  details: string[];
};

type StateData = {
  name: string;
  representatives: number;
  abbreviation: string;
};

const stateData: StateData[] = [
  { name: 'California', representatives: 52, abbreviation: 'CA' },
  { name: 'Texas', representatives: 38, abbreviation: 'TX' },
  { name: 'Florida', representatives: 28, abbreviation: 'FL' },
  // ... Add all states
];

const congressInfo: Record<string, CongressInfo> = {
  house: {
    title: 'House of Representatives',
    description: 'The People\'s House - where representation is based on state population.',
    totalMembers: 435,
    color: 'bg-blue-500/10 border-blue-500/20',
    details: [
      '435 voting members',
      'Each state gets representatives based on population',
      'Elections every 2 years',
      'Led by the Speaker of the House',
    ],
  },
  senate: {
    title: 'Senate',
    description: 'The Upper Chamber - where each state has equal representation.',
    totalMembers: 100,
    color: 'bg-red-500/10 border-red-500/20',
    details: [
      '100 total members (2 per state)',
      'Senators serve 6-year terms',
      'One-third of seats up for election every 2 years',
      'Led by the President of the Senate',
    ],
  },
};

export function CongressSection() {
  const [activeState, setActiveState] = useState<StateData | null>(null);

  return (
    <div className="space-y-16 scroll-smooth">
      {/* Introduction Section */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative"
      >
        <div className="max-w-4xl mx-auto text-center">
          <div className="flex justify-center mb-8">
            <span className="text-4xl">🏛️</span>
          </div>
          <h2 className="text-4xl font-bold mb-6">What is Congress?</h2>
          <p className="text-xl mb-8 leading-relaxed">
            Congress is America's law-making body, where elected officials come together
            to create and pass laws that shape our nation. Think of it as the "board of directors"
            for the United States, where representatives from all states meet to make important decisions.
          </p>
        </div>

        {/* Capitol Image with Parallax Effect */}
        <motion.div 
          className="relative h-[50vh] rounded-xl overflow-hidden mb-12 mx-auto max-w-5xl"
          whileInView={{ scale: 1.02 }}
          transition={{ duration: 0.8 }}
        >
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
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent">
            <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
              <h3 className="text-2xl font-bold mb-2">The U.S. Capitol Building</h3>
              <p className="text-lg">Where Congress meets to make laws for the nation</p>
            </div>
          </div>
        </motion.div>
      </motion.section>

      {/* Congress Structure */}
      <motion.section
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
        className="max-w-5xl mx-auto"
      >
        <div className="text-center mb-12">
          <h3 className="text-3xl font-bold mb-3">Two Parts, One Congress</h3>
          <p className="text-xl text-muted-foreground">
            Congress is divided into two chambers, each serving a unique role in our democracy
          </p>
        </div>

        {/* Two Chambers */}
        <div className="grid md:grid-cols-2 gap-8">
          {(['house', 'senate'] as const).map((chamber) => (
            <motion.div
              key={chamber}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Card className={`p-6 h-full ${congressInfo[chamber].color}`}>
                <h3 className="text-2xl font-bold mb-4 text-center">
                  {congressInfo[chamber].title}
                </h3>
                <p className="text-lg mb-6 text-center text-muted-foreground">
                  {congressInfo[chamber].description}
                </p>
                <div className="bg-background/50 p-4 rounded-lg mb-4">
                  <p className="font-semibold text-center text-xl">
                    {congressInfo[chamber].totalMembers} Members
                  </p>
                </div>
                <ul className="space-y-3">
                  {congressInfo[chamber].details.map((detail, index) => (
                    <motion.li
                      key={index}
                      initial={{ opacity: 0, x: -20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="flex items-center gap-3"
                    >
                      <span className="text-primary">•</span>
                      <span>{detail}</span>
                    </motion.li>
                  ))}
                </ul>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Interactive Map Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-16 p-8 bg-card rounded-xl"
        >
          <div className="text-center mb-8">
            <h3 className="text-2xl font-bold mb-4">How many Representatives and Senators are there?</h3>
            <p className="text-lg text-muted-foreground">
              Each state has a number of representatives based on its population, while every state has exactly two senators, regardless of population.
            </p>
          </div>

          <div className="relative aspect-[16/9] bg-muted rounded-lg overflow-hidden">
            <USMap onStateHover={setActiveState} />
          </div>
        </motion.div>
      </motion.section>
    </div>
  );
} 