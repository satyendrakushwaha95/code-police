import { createContext, useContext, useReducer, useEffect, type ReactNode } from 'react';
import type { AppSettings } from '../types/settings';
import { DEFAULT_SETTINGS } from '../types/settings';
import { saveToStorage, loadFromStorage, STORAGE_KEYS } from '../services/storage';

type SettingsAction =
  | { type: 'UPDATE_SETTINGS'; payload: Partial<AppSettings> }
  | { type: 'RESET_SETTINGS' }
  | { type: 'LOAD_SETTINGS'; payload: AppSettings };

function settingsReducer(state: AppSettings, action: SettingsAction): AppSettings {
  switch (action.type) {
    case 'UPDATE_SETTINGS':
      return { ...state, ...action.payload };
    case 'RESET_SETTINGS':
      return { ...DEFAULT_SETTINGS };
    case 'LOAD_SETTINGS':
      return action.payload;
    default:
      return state;
  }
}

interface SettingsContextValue {
  settings: AppSettings;
  updateSettings: (updates: Partial<AppSettings>) => void;
  resetSettings: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, dispatch] = useReducer(settingsReducer, DEFAULT_SETTINGS, () => {
    return loadFromStorage<AppSettings>(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
  });

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.SETTINGS, settings);
  }, [settings]);

  // Apply theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme);
  }, [settings.theme]);

  const updateSettings = (updates: Partial<AppSettings>) => {
    dispatch({ type: 'UPDATE_SETTINGS', payload: updates });
  };

  const resetSettings = () => {
    dispatch({ type: 'RESET_SETTINGS' });
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, resetSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be within SettingsProvider');
  return ctx;
}
