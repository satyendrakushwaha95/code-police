import { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';

export interface WorkspaceFile {
  name: string;
  path: string;
  absolutePath: string; // Used for Node JS fs operations later
}

interface WorkspaceState {
  rootPath: string | null;
  folderName: string | null;
  filesIndex: WorkspaceFile[];
  isIndexing: boolean;
  indexingProgress: { current: number; total: number } | null;
  error: string | null;
}

interface WorkspaceContextType {
  state: WorkspaceState;
  openFolder: () => Promise<void>;
  closeFolder: () => void;
  indexWorkspace: (model: string) => Promise<{ success: boolean; indexedCount: number }>;
  searchWorkspace: (model: string, query: string, limit?: number) => Promise<any[]>;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WorkspaceState>({
    rootPath: null,
    folderName: null,
    filesIndex: [],
    isIndexing: false,
    indexingProgress: null,
    error: null,
  });

  const openFolder = useCallback(async () => {
    // Check if running in Electron
    if (!(window as any).ipcRenderer) {
      setState(prev => ({ ...prev, error: 'Must run in Electron app for local folder access.' }));
      return;
    }

    try {
      setState(prev => ({ ...prev, isIndexing: true, error: null }));
      
      const result = await (window as any).ipcRenderer.invoke('dialog:openDirectory');
      
      if (!result) {
        // User canceled
        setState(prev => ({ ...prev, isIndexing: false }));
        return;
      }

      const { rootPath, folderName, filesIndex } = result;

      // Sort files alphabetically by path
      filesIndex.sort((a: WorkspaceFile, b: WorkspaceFile) => a.path.localeCompare(b.path));

      setState({
        rootPath,
        folderName,
        filesIndex,
        isIndexing: false,
        indexingProgress: null,
        error: null,
      });
    } catch (err: any) {
      setState(prev => ({ ...prev, isIndexing: false, error: 'Failed to open folder: ' + err.message }));
    }
  }, []);

  const closeFolder = useCallback(() => {
    setState({
      rootPath: null,
      folderName: null,
      filesIndex: [],
      isIndexing: false,
      indexingProgress: null,
      error: null,
    });
  }, []);

  const indexWorkspace = useCallback(async (model: string) => {
    if (!(window as any).ipcRenderer) throw new Error('Must run in Electron');
    const totalFiles = state.filesIndex.length;
    setState(prev => ({
      ...prev,
      isIndexing: true,
      indexingProgress: { current: 0, total: totalFiles },
      error: null
    }));

    try {
      const result = await (window as any).ipcRenderer.invoke('fs:indexRepository', model, state.filesIndex);
      setState(prev => ({
        ...prev,
        isIndexing: false,
        indexingProgress: null
      }));
      return result;
    } catch (err: any) {
      setState(prev => ({
        ...prev,
        isIndexing: false,
        indexingProgress: null,
        error: 'Indexing failed: ' + err.message
      }));
      throw err;
    }
  }, [state.filesIndex]);

  const searchWorkspace = useCallback(async (model: string, query: string, limit: number = 5) => {
    if (!(window as any).ipcRenderer) throw new Error('Must run in Electron');
    try {
      const results = await (window as any).ipcRenderer.invoke('fs:searchRepository', model, query, limit);
      return results;
    } catch (err: any) {
      console.error('Search failed:', err);
      throw err;
    }
  }, []);

  return (
    <WorkspaceContext.Provider value={{ state, openFolder, closeFolder, indexWorkspace, searchWorkspace }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (context === undefined) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
}
