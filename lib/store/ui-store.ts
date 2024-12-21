import { create } from 'zustand';

interface UIState {
  // Progress Colors
  getProgressColor: (stage: number) => string;
  getProgressLabel: (stage: number) => string;
  
  // Loading States
  isPageLoading: boolean;
  setPageLoading: (loading: boolean) => void;
  
  // Error Handling
  globalError: Error | null;
  setGlobalError: (error: Error | null) => void;
  clearGlobalError: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  getProgressColor: (stage: number) => {
    switch (stage) {
      case -1:
        return 'bg-red-500';
      case 100:
        return 'bg-green-500';
      default:
        return 'bg-blue-500';
    }
  },

  getProgressLabel: (stage: number) => {
    switch (stage) {
      case -1:
        return 'Failed';
      case 20:
        return 'Introduced';
      case 40:
        return 'In Committee';
      case 60:
        return 'Passed First Chamber';
      case 80:
        return 'Passed Both Chambers';
      case 90:
        return 'To President';
      case 100:
        return 'Became Law';
      default:
        return 'In Progress';
    }
  },

  isPageLoading: false,
  setPageLoading: (loading: boolean) => set({ isPageLoading: loading }),

  globalError: null,
  setGlobalError: (error: Error | null) => set({ globalError: error }),
  clearGlobalError: () => set({ globalError: null }),
})); 