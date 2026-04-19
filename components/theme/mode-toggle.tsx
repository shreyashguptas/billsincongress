'use client';

import * as React from 'react';
import { Moon, Sun, Monitor } from 'lucide-react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';

export function ModeToggle() {
  const { setTheme, theme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const options: Array<{ value: 'light' | 'dark' | 'system'; icon: React.ReactNode; label: string }> = [
    { value: 'light', icon: <Sun className="h-3.5 w-3.5" />, label: 'Light' },
    { value: 'dark', icon: <Moon className="h-3.5 w-3.5" />, label: 'Dark' },
    { value: 'system', icon: <Monitor className="h-3.5 w-3.5" />, label: 'System' },
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Color theme"
      className="inline-flex items-center rounded-sm border border-border bg-background p-0.5"
    >
      {options.map((opt) => {
        const active = mounted && theme === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={opt.label}
            onClick={() => setTheme(opt.value)}
            className={cn(
              'inline-flex h-7 w-7 items-center justify-center rounded-sm transition-colors',
              active
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {opt.icon}
          </button>
        );
      })}
    </div>
  );
}
