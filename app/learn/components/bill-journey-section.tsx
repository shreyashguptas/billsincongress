'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ChevronRight } from 'lucide-react';

type JourneyStep = {
  id: string;
  title: string;
  description: string;
  details: string[];
  duration: string;
  successRate: number;
  icon: string;
};

const journeySteps: JourneyStep[] = [
  {
    id: 'introduction',
    title: 'Introduction',
    description: 'The bill begins its journey',
    details: [
      'Bill is written and reviewed',
      'Sponsors are gathered',
      'Bill is officially submitted',
    ],
    duration: '1-2 days',
    successRate: 100,
    icon: '📝',
  },
  {
    id: 'committee',
    title: 'Committee Review',
    description: 'Detailed study and changes',
    details: [
      'Committee studies the bill',
      'Public hearings may be held',
      'Committee votes to report or table',
    ],
    duration: '2-3 months',
    successRate: 45,
    icon: '👥',
  },
  {
    id: 'floor',
    title: 'Floor Action',
    description: 'Debate and voting in chamber',
    details: [
      'Bill is debated',
      'Members can propose amendments',
      'Chamber votes on final passage',
    ],
    duration: '1-2 weeks',
    successRate: 25,
    icon: '🗣️',
  },
  {
    id: 'other-chamber',
    title: 'Other Chamber',
    description: 'Process repeats in other chamber',
    details: [
      'Goes through same process',
      'May make different changes',
      'Both versions must match exactly',
    ],
    duration: '1-3 months',
    successRate: 15,
    icon: '🔄',
  },
  {
    id: 'president',
    title: 'Presidential Action',
    description: 'Final step to become law',
    details: [
      'President reviews the bill',
      'Can sign or veto',
      'Becomes law if signed',
    ],
    duration: '10 days',
    successRate: 10,
    icon: '✍️',
  },
];

export function BillJourneySection() {
  const [currentStep, setCurrentStep] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const handleStepClick = (index: number) => {
    setCurrentStep(index);
  };

  const handleDragStart = () => {
    setIsDragging(true);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    if (currentStep < journeySteps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  return (
    <div className="space-y-8">
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex items-center gap-3 mb-6">
            <span className="text-2xl">🗺️</span>
            <h2 className="text-3xl font-bold">The Journey of a Bill</h2>
          </div>

          <p className="text-xl mb-8">
            Follow a bill's exciting journey from an idea to becoming a law! Drag each
            stage to see what happens next.
          </p>

          {/* Progress Bar */}
          <div className="mb-8">
            <div className="flex justify-between mb-2">
              <span className="text-sm text-muted-foreground">Progress</span>
              <span className="text-sm font-medium">
                Stage {currentStep + 1} of {journeySteps.length}
              </span>
            </div>
            <Progress value={(currentStep / (journeySteps.length - 1)) * 100} className="h-2" />
          </div>

          {/* Journey Steps */}
          <div className="space-y-4">
            {journeySteps.map((step, index) => (
              <motion.div
                key={step.id}
                animate={{
                  scale: index === currentStep ? 1 : 0.98,
                  opacity: index < currentStep ? 0.7 : 1,
                }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Card
                  className={`p-6 ${
                    index === currentStep
                      ? 'border-primary bg-primary/5'
                      : index < currentStep
                      ? 'border-success bg-success/5'
                      : 'border-border'
                  } ${
                    index === currentStep && isDragging ? 'cursor-grabbing' : 'cursor-pointer'
                  }`}
                  onClick={() => handleStepClick(index)}
                  draggable={index === currentStep}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                >
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-12 h-12 flex items-center justify-center rounded-full bg-primary/10 text-2xl">
                      {step.icon}
                    </div>
                    <div className="flex-grow">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-xl font-semibold">{step.title}</h3>
                        <span className="text-sm text-muted-foreground">
                          Success Rate: {step.successRate}%
                        </span>
                      </div>
                      <p className="text-muted-foreground mb-4">{step.description}</p>
                      <div className="space-y-2">
                        {step.details.map((detail, i) => (
                          <div key={i} className="flex items-center gap-2 text-sm">
                            <ChevronRight className="h-4 w-4 text-primary" />
                            <span>{detail}</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 flex justify-between text-sm text-muted-foreground">
                        <span>Typical Duration: {step.duration}</span>
                        {index === currentStep && (
                          <span className="text-primary font-medium">
                            {isDragging ? 'Release to advance →' : 'Drag to continue →'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>

        </motion.div>
      </div>
    </div>
  );
} 