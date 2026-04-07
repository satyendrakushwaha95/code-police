const STORAGE_KEY = 'localmind-editor-state';

interface PersistedTab {
  path: string;
  absolutePath: string;
  isActive: boolean;
}

export interface EditorPersistedState {
  expandedFolders: string[];
  openTabs: PersistedTab[];
}

export function useEditorState() {
  const load = (): EditorPersistedState | null => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  };

  const save = (state: EditorPersistedState) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch { /* localStorage full or unavailable */ }
  };

  const clear = () => {
    localStorage.removeItem(STORAGE_KEY);
  };

  return { load, save, clear };
}
