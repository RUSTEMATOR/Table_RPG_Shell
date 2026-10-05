import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// tailwind-merge должен знать свои токены (rounded-card, font-ui, text-muted…), иначе «съест» нужные классы.
const merge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-family': [{ font: ['ui', 'read', 'display', 'name'] }],
      rounded: [{ rounded: ['card', 'control', 'sheet'] }],
      shadow: [{ shadow: ['card'] }],
    },
  },
});

/** Склейка классов с разрешением конфликтов Tailwind (как cn() в shadcn). */
export function cn(...inputs: ClassValue[]): string {
  return merge(clsx(inputs));
}
