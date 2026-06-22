import { create } from 'zustand';
import { User } from './types';

interface AppState {
  isFuriganaEnabled: boolean;
  textSizeLevel: number;
  toggleFurigana: () => void;
  setTextSizeLevel: (level: number) => void;
  user: User | null;
  setUser: (user: User | null) => void;
  logout: () => void;
  geminiApiKey: string;
  setGeminiApiKey: (key: string) => void;
  appMode: 'LOCAL' | 'SHARED';
  setAppMode: (mode: 'LOCAL' | 'SHARED') => void;
}

export const useStore = create<AppState>((set) => ({
  isFuriganaEnabled: JSON.parse(localStorage.getItem('isFuriganaEnabled') ?? 'true'),
  textSizeLevel: parseInt(localStorage.getItem('textSizeLevel') ?? '3', 10),
  user: (() => {
    try {
      const stored = localStorage.getItem('user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  })(),
  geminiApiKey: localStorage.getItem('geminiApiKey') || '',
  appMode: (localStorage.getItem('appMode') as 'LOCAL' | 'SHARED') || 'SHARED',
  toggleFurigana: () => set((state) => {
    const newVal = !state.isFuriganaEnabled;
    localStorage.setItem('isFuriganaEnabled', JSON.stringify(newVal));
    return { isFuriganaEnabled: newVal };
  }),
  setTextSizeLevel: (level) => set(() => {
    localStorage.setItem('textSizeLevel', level.toString());
    return { textSizeLevel: level };
  }),
  setUser: (user) => set(() => {
    if (user) {
      localStorage.setItem('user', JSON.stringify(user));
    } else {
      localStorage.removeItem('user');
    }
    return { user };
  }),
  logout: () => set(() => {
    localStorage.removeItem('user');
    return { user: null };
  }),
  setGeminiApiKey: (key) => set(() => {
    localStorage.setItem('geminiApiKey', key);
    return { geminiApiKey: key };
  }),
  setAppMode: (mode) => set(() => {
    localStorage.setItem('appMode', mode);
    return { appMode: mode };
  })
}));
