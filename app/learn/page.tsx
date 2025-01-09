'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { CongressSection } from './components/congress-section';
import { BillsSection } from './components/bills-section';
import { BillJourneySection } from './components/bill-journey-section';

export default function LearnPage() {
  return (
    <main className="container mx-auto px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="space-y-16"
      >


        <section id="congress">
          <CongressSection />
          <div className="border-b border-border my-16" />
        </section>

        <section id="bills">
          <BillsSection />
          <div className="border-b border-border my-16" />
        </section>

        <section id="journey">
          <BillJourneySection />
        </section>

        <motion.div
          className="fixed bottom-8 right-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
        >
          <a
            href="#"
            className="bg-primary text-primary-foreground p-3 rounded-full shadow-lg hover:shadow-xl transition-shadow"
            aria-label="Back to top"
          >
            ↑
          </a>
        </motion.div>
      </motion.div>
    </main>
  );
} 