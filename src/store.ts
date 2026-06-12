import { create } from 'zustand';

interface AppState {
  isFuriganaEnabled: boolean;
  textSizeLevel: number;
  toggleFurigana: () => void;
  setTextSizeLevel: (level: number) => void;
}

export const useStore = create<AppState>((set) => ({
  isFuriganaEnabled: JSON.parse(localStorage.getItem('isFuriganaEnabled') ?? 'true'),
  textSizeLevel: parseInt(localStorage.getItem('textSizeLevel') ?? '3', 10),
  toggleFurigana: () => set((state) => {
    const newVal = !state.isFuriganaEnabled;
    localStorage.setItem('isFuriganaEnabled', JSON.stringify(newVal));
    return { isFuriganaEnabled: newVal };
  }),
  setTextSizeLevel: (level) => set(() => {
    localStorage.setItem('textSizeLevel', level.toString());
    return { textSizeLevel: level };
  })
}));
