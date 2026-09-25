'use client';

import * as React from 'react';
import { Moon, Sun, Monitor } from 'lucide-react';
import { useTheme } from 'next-themes';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

type ThemeChoice = 'light' | 'dark' | 'system';

export function ModeToggle() {
  const { setTheme, theme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const options: Array<{ value: ThemeChoice; icon: React.ReactNode; label: string }> = [
    { value: 'light', icon: <Sun className="h-3.5 w-3.5" />, label: 'Light' },
    { value: 'dark', icon: <Moon className="h-3.5 w-3.5" />, label: 'Dark' },
    { value: 'system', icon: <Monitor className="h-3.5 w-3.5" />, label: 'System' },
  ];

  // A sunken track with the active choice raised. Nothing is marked until
  // mount, since the server cannot know the stored theme.
  return (
    <ToggleGroup
      type="single"
      aria-label="Color theme"
      value={mounted ? (theme ?? '') : ''}
      // Radix reports '' when the active item is pressed again; a theme is
      // always set, so ignore it.
      onValueChange={(value) => value && setTheme(value as ThemeChoice)}
      className="inline-flex gap-0.5 rounded-md bg-sunken p-[3px]"
    >
      {options.map((opt) => (
        <ToggleGroupItem
          key={opt.value}
          value={opt.value}
          aria-label={opt.label}
          className="h-8 w-8 min-w-8 rounded-[6px] p-0 text-ink-3 hover:bg-transparent hover:text-ink data-[state=on]:bg-raised data-[state=on]:text-ink data-[state=on]:shadow-sm [&_svg]:size-3.5"
        >
          {opt.icon}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
