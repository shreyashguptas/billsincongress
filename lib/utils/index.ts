import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// tailwind-merge only knows Tailwind's default scale. Without this it reads the
// brand's type sizes (tailwind.config.ts) as text *colours*, so
// `cn('text-display-sm', 'text-ink')` silently dropped one of the two.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        { text: ['display-2xl', 'display-xl', 'display-lg', 'display-md', 'display-sm', 'title', 'reading', 'reading-sm'] },
      ],
      shadow: [{ shadow: ['float'] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export * from './bill-stages';
export * from './format';
