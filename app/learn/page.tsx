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
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">
            Understanding Congress & Bills
          </h1>
          <p className="text-xl text-muted-foreground">
            Your guide to understanding how laws are made in the United States
          </p>
        </div>

        <nav className="bg-muted p-6 rounded-lg mb-12">
          <h2 className="text-2xl font-semibold mb-4">In this guide:</h2>
          <ul className="space-y-2">
            <li>
              <a href="#congress" className="text-primary hover:underline">
                1. What is Congress? 🏛️
              </a>
            </li>
            <li>
              <a href="#bills" className="text-primary hover:underline">
                2. Understanding Bills 📜
              </a>
            </li>
            <li>
              <a href="#journey" className="text-primary hover:underline">
                3. Bill Journey Map 🗺️
              </a>
            </li>
          </ul>
        </nav>

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