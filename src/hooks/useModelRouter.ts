import { useState, useEffect, useCallback } from 'react';

export type TaskCategory =
  | 'code_generation'
  | 'code_refactor'
  | 'documentation'
  | 'planning'
  | 'review'
  | 'chat_general';

export interface RouteConfig {
  model: string;
  enabled: boolean;
  fallbackToDefault: boolean;
}

export interface RoutingConfig {
  version: number;
  defaultModel: string;
  routes: Record<TaskCategory, RouteConfig>;
}

const ipcRenderer = (window as any).ipcRenderer;

interface UseModelRouterReturn {
  config: RoutingConfig | null;
  availableModels: string[];
  loading: boolean;
  error: string | null;
  setRoute: (category: TaskCategory, model: string) => void;
  setDefaultModel: (model: string) => void;
  toggleRoute: (category: TaskCategory, enabled: boolean) => void;
  saveConfig: () => Promise<{ success: boolean; errors: string[] }>;
  validateModel: (model: string) => Promise<boolean>;
  refreshModels: () => Promise<void>;
}

export function useModelRouter(): UseModelRouterReturn {
  const [config, setConfig] = useState<RoutingConfig | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        setLoading(true);
        const [configData, models] = await Promise.all([
          ipcRenderer.invoke('router:getConfig'),
          ipcRenderer.invoke('router:getAvailableModels'),
        ]);
        setConfig(configData);
        setAvailableModels(models);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load routing config');
      } finally {
        setLoading(false);
      }
    };

    loadInitialData();

    const handleConfigChanged = async () => {
      console.log('[useModelRouter] Config changed externally, reloading...');
      try {
        const configData = await ipcRenderer.invoke('router:getConfig');
        setConfig(configData);
      } catch (err) {
        console.error('[useModelRouter] Failed to reload config:', err);
      }
    };

    ipcRenderer.on('router:configChanged', handleConfigChanged);

    return () => {
      ipcRenderer.off('router:configChanged', handleConfigChanged);
    };
  }, []);

  const setRoute = useCallback((category: TaskCategory, model: string) => {
    setConfig(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        routes: {
          ...prev.routes,
          [category]: {
            ...prev.routes[category],
            model,
          },
        },
      };
    });
  }, []);

  const toggleRoute = useCallback((category: TaskCategory, enabled: boolean) => {
    setConfig(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        routes: {
          ...prev.routes,
          [category]: {
            ...prev.routes[category],
            enabled,
          },
        },
      };
    });
  }, []);

  const saveConfig = useCallback(async (): Promise<{ success: boolean; errors: string[] }> => {
    if (!config) {
      return { success: false, errors: ['No config to save'] };
    }

    try {
      const result = await ipcRenderer.invoke('router:setConfig', { config });
      if (result.success) {
        setError(null);
      } else {
        setError(result.errors.join(', '));
      }
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to save config';
      setError(errorMsg);
      return { success: false, errors: [errorMsg] };
    }
  }, [config]);

  const validateModel = useCallback(async (model: string): Promise<boolean> => {
    try {
      const result = await ipcRenderer.invoke('router:validateModel', { model });
      return result.available;
    } catch {
      return false;
    }
  }, []);

  const refreshModels = useCallback(async () => {
    try {
      const models = await ipcRenderer.invoke('router:getAvailableModels');
      setAvailableModels(models);
    } catch (err) {
      console.error('Failed to refresh models:', err);
    }
  }, []);

  const setDefaultModel = useCallback((model: string) => {
    setConfig(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        defaultModel: model,
      };
    });
  }, []);

  return {
    config,
    availableModels,
    loading,
    error,
    setRoute,
    setDefaultModel,
    toggleRoute,
    saveConfig,
    validateModel,
    refreshModels,
  };
}
