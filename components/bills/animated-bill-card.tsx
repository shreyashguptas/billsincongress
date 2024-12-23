"use client";

import { useRef, useEffect, useState } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Bill } from '@/lib/types/bill';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BillProgress } from '@/components/bills/bill-progress';
import Link from 'next/link';

interface AnimatedBillCardProps {
  bill: Bill;
  index: number;
}

export function AnimatedBillCard({ bill, index }: AnimatedBillCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isMounted, setIsMounted] = useState(false);

  // Mouse tracking values with proper types
  const mouseX = useMotionValue<number>(0);
  const mouseY = useMotionValue<number>(0);

  // Spring physics for smooth animation
  const rotateX = useSpring(useTransform(mouseY, [-0.5, 0.5], [2, -2]), {
    stiffness: 300,
    damping: 30,
  });
  const rotateY = useSpring(useTransform(mouseX, [-0.5, 0.5], [-2, 2]), {
    stiffness: 300,
    damping: 30,
  });

  // Scale animation on hover
  const scale = useSpring(1, {
    stiffness: 400,
    damping: 25,
  });

  // Handle mouse move
  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;

    const rect = cardRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    // Normalize mouse position between -0.5 and 0.5
    mouseX.set((event.clientX - centerX) / rect.width);
    mouseY.set((event.clientY - centerY) / rect.height);
    scale.set(1.02);
  };

  // Reset card position when mouse leaves
  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
    scale.set(1);
  };

  // Handle hydration
  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return null;
  }

  // Get sponsor initials
  const sponsorInitials = `${bill.sponsor_first_name?.[0] || ''}${bill.sponsor_last_name?.[0] || ''}`;

  // Convert progress_stage to number
  const stage = typeof bill.progress_stage === 'string' 
    ? parseInt(bill.progress_stage, 10) 
    : bill.progress_stage;

  // Format date
  const formattedDate = new Date(bill.introduced_date + 'T00:00:00Z').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  });

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.4,
        delay: index * 0.1,
        ease: [0.21, 0.47, 0.32, 0.98]
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        rotateX,
        rotateY,
        scale,
        transformStyle: 'preserve-3d',
        perspective: '1000px'
      }}
      className="group"
    >
      <Link href={`/bills/${bill.id}`}>
        <Card className="h-full hover:bg-accent/50 transition-colors overflow-hidden">
          {/* Top section with date and policy area */}
          <div className="p-4">
            <div className="flex justify-between items-baseline mb-2">
              <div className="text-xs text-muted-foreground">
                {formattedDate}
              </div>
            </div>
            {bill.bill_subjects?.policy_area_name && (
              <Badge 
                variant="outline" 
                className="transition-all duration-300 group-hover:border-primary group-hover:text-primary"
              >
                {bill.bill_subjects.policy_area_name}
              </Badge>
            )}
          </div>

          {/* Main content */}
          <CardContent className="space-y-4 p-4 pt-0">
            {/* Title with truncation */}
            <h3 className="font-medium leading-snug line-clamp-2 min-h-[48px]">
              {bill.title}
            </h3>

            {/* Progress bar */}
            <BillProgress
              stage={stage}
              description={bill.progress_description}
            />

            {/* Sponsor info */}
            <div className="flex items-center gap-2 pt-2">
              <div className="h-8 w-8 rounded-full bg-accent flex items-center justify-center">
                <span className="text-sm font-medium">
                  {sponsorInitials}
                </span>
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium">
                  {bill.sponsor_first_name} {bill.sponsor_last_name}
                </div>
                <div className="text-xs text-muted-foreground">
                  Primary Sponsor
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>
    </motion.div>
  );
} 