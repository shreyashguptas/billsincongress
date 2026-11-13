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
  // mount, since the server cannot know the stored theme. Under a mouse the
  // segments are 32px icons; under a finger each is a 44px segment that names
  // its theme, so the reader does not have to decode a sun and a moon, where
  // the screen has room for the three names.
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
          className="h-8 w-8 min-w-8 rounded-[6px] p-0 touchable:h-11 touchable:w-auto touchable:min-w-11 touchable:gap-1.5 touchable:px-3 text-ink-2 hover:bg-transparent hover:text-ink data-[state=on]:bg-raised data-[state=on]:text-ink data-[state=on]:shadow-xs [&_svg]:size-3.5 touchable:[&_svg]:size-4"
        >
          {opt.icon}
          {/* The names need 18em of screen (288px at the default font); a 390px
              phone at a 24px font is 16.25em, and there the three icons stay.
              The rule is .theme-seg-label in app/globals.css: Tailwind 3 cannot
              stack an arbitrary media variant under `touchable:` (it writes
              "@media(...)undefined", and the dev compiler then drops every
              style in the sheet, fonts included). */}
          <span className="theme-seg-label text-caption">{opt.label}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
