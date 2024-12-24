import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { BillStages } from '@/lib/utils/bill-stages';

interface UIState {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  getProgressColor: (stage: number) => string;
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      theme: 'light',
      toggleTheme: () => set(state => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
      getProgressColor: (stage: number) => {
        switch (stage) {
          case BillStages.BECAME_LAW:
            return 'bg-green-500';
          default:
            return 'bg-blue-500';
        }
      },
    }),
    {
      name: 'ui-store',
    }
  )
); 