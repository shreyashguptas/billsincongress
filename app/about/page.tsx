import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { GithubIcon, BookOpen, Scale, Brain, AlertTriangle } from 'lucide-react';
import { sharedViewport } from '../shared-metadata';
import type { Viewport } from 'next';

export const viewport: Viewport = sharedViewport;

export default function AboutPage() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background">
      <div className="container py-12">
        <div className="mx-auto max-w-5xl space-y-12">
          <div className="space-y-4 text-center">
            <h1 className="text-4xl font-bold tracking-tighter sm:text-5xl">
              About Congressional Bill Tracker
            </h1>
            <p className="mx-auto max-w-[700px] text-gray-600 dark:text-gray-400 md:text-xl">
              Empowering citizens with transparent, accessible information about
              legislative processes and congressional activities.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="flex flex-col items-center space-y-2 rounded-lg border p-6 text-center hover:bg-muted/50"
              >
                <feature.icon className="h-8 w-8 text-primary" />
                <h3 className="font-semibold">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>

          <div className="space-y-4 text-center">
            <h2 className="text-3xl font-bold">How It Works</h2>
            <p className="mx-auto max-w-[700px] text-gray-600 dark:text-gray-400">
              Our platform combines official congressional data with AI-powered
              analysis to make legislative information more accessible and
              understandable.
            </p>
          </div>

          <div className="flex justify-center">
            <Link href="/bills">
              <Button size="lg">Start Exploring Bills</Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

const features = [
  {
    title: 'Open Source',
    description: 'Transparent and community-driven development for accountability.',
    icon: GithubIcon,
  },
  {
    title: 'Legislative Tracking',
    description: 'Real-time updates on bill status and congressional activities.',
    icon: BookOpen,
  },
  {
    title: 'AI Analysis',
    description: 'Advanced AI summaries and insights for better understanding.',
    icon: Brain,
  },
  {
    title: 'Unofficial Resource',
    description: 'Independent platform using official Congress.gov API data. Not affiliated with the U.S. government.',
    icon: AlertTriangle,
  },
];