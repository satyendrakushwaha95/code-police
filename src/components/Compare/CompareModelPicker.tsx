import { useState, useEffect, useCallback } from 'react';
import type { CompareModelEntry } from '../../hooks/useCompare';
import type { ProviderModel } from '../../services/ollama';
import { ollamaService } from '../../services/ollama';
import { useSettings } from '../../store/SettingsContext';
import './Compare.css';

const ipcRenderer = (window as any).ipcRenderer;

const EMBEDDING_PATTERNS = [
  'embed', 'nomic-embed', 'mxbai-embed', 'all-minilm', 'bge-',
  'snowflake-arctic-embed', 'e5-', 'gte-', 'jina-embed',
  'text-embedding', 'voyage-', 'cohere-embed',
];

function isEmbeddingModel(name: string): boolean {
  const lower = name.toLowerCase();
  return EMBEDDING_PATTERNS.some(p => lower.includes(p));
}

interface ProviderInfo {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  endpoint: string;
}

interface CompareModelPickerProps {
  onSelect: (models: CompareModelEntry[]) => void;
  disabled?: boolean;
}

export default function CompareModelPicker({ onSelect, disabled }: CompareModelPickerProps) {
  const [allModels, setAllModels] = useState<ProviderModel[]>([]);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const { settings } = useSettings();

  const loadModels = useCallback(async () => {
    setLoading(true);
    try {
      const [registryModels, providerList] = await Promise.all([
        ollamaService.listAllProviderModels(),
        ipcRenderer.invoke('provider:list'),
      ]);

      let models = registryModels;

      // Fallback: if registry returned no models, fetch directly from Ollama
      if (models.length === 0) {
        try {
          const ollamaModels = await ollamaService.listModels();
          models = ollamaModels.map(m => ({
            id: m.name,
            name: m.name,
            providerId: 'ollama-default',
            providerName: 'Ollama (Local)',
            size: m.size,
          }));
        } catch { /* Ollama not running */ }
      }

      // Also try direct Ollama fetch to catch any models the registry missed
      if (!models.some(m => m.providerId.includes('ollama'))) {
        try {
          const ollamaModels = await ollamaService.listModels();
          const ollamaProviderModels: ProviderModel[] = ollamaModels.map(m => ({
            id: m.name,
            name: m.name,
            providerId: 'ollama-default',
            providerName: 'Ollama (Local)',
            size: m.size,
          }));
          models = [...ollamaProviderModels, ...models];
        } catch { /* */ }
      }

      // Deduplicate by providerId::model
      const seen = new Set<string>();
      models = models.filter(m => {
        const key = `${m.providerId}::${m.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      setAllModels(models.filter(m => !isEmbeddingModel(m.id || m.name)));
      setProviders(providerList.filter((p: ProviderInfo) => p.enabled));
    } catch (err) {
      console.error('Failed to load models for comparison:', err);

      // Last resort: try direct Ollama only
      try {
        const ollamaModels = await ollamaService.listModels();
        setAllModels(ollamaModels.filter(m => !isEmbeddingModel(m.name)).map(m => ({
          id: m.name,
          name: m.name,
          providerId: 'ollama-default',
          providerName: 'Ollama (Local)',
          size: m.size,
        })));
        setProviders([{ id: 'ollama-default', name: 'Ollama (Local)', type: 'ollama', enabled: true, endpoint: settings.endpoint }]);
      } catch { /* completely offline */ }
    } finally {
      setLoading(false);
    }
  }, [settings.endpoint]);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  const toggleModel = (key: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else if (next.size < 4) {
        next.add(key);
      }
      return next;
    });
  };

  const handleCompare = () => {
    const entries: CompareModelEntry[] = [];
    for (const key of selected) {
      const model = allModels.find(m => `${m.providerId}::${m.id}` === key);
      if (model) {
        entries.push({
          providerId: model.providerId,
          providerName: model.providerName,
          model: model.id,
        });
      }
    }
    if (entries.length >= 2) {
      onSelect(entries);
    }
  };

  const groupedByProvider = providers.map(p => ({
    ...p,
    models: allModels.filter(m => m.providerId === p.id),
  }));

  if (loading) {
    return <div className="compare-picker-loading">Loading models from Ollama and all providers...</div>;
  }

  return (
    <div className="compare-model-picker">
      <div className="picker-header">
        <span className="picker-title">Select 2-4 models to compare</span>
        <div className="picker-header-right">
          <span className="picker-count">{selected.size} selected</span>
          <button className="picker-refresh-btn" onClick={loadModels} title="Refresh model list">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
          </button>
        </div>
      </div>

      <div className="picker-groups">
        {groupedByProvider.map(group => (
          group.models.length > 0 && (
            <div key={group.id} className="picker-group">
              <div className="picker-group-label">{group.name} ({group.models.length})</div>
              <div className="picker-models">
                {group.models.map(model => {
                  const key = `${model.providerId}::${model.id}`;
                  const isSelected = selected.has(key);
                  return (
                    <button
                      key={key}
                      className={`picker-model-chip ${isSelected ? 'selected' : ''}`}
                      onClick={() => toggleModel(key)}
                      disabled={!isSelected && selected.size >= 4}
                    >
                      <span className="picker-model-name">{model.name}</span>
                      {model.size && (
                        <span className="picker-model-size">
                          {model.size > 1e9 ? `${(model.size / 1e9).toFixed(1)}GB` : `${(model.size / 1e6).toFixed(0)}MB`}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )
        ))}
      </div>

      {allModels.length === 0 && (
        <div className="picker-empty">
          <p>No models found.</p>
          <p>Make sure Ollama is running at <code>{settings.endpoint}</code> with models pulled, or add cloud providers in Settings → Providers.</p>
          <button className="btn btn-secondary btn-sm" onClick={loadModels} style={{ marginTop: 8 }}>Retry</button>
        </div>
      )}

      <div className="picker-actions">
        <button
          className="btn btn-primary"
          onClick={handleCompare}
          disabled={disabled || selected.size < 2}
        >
          Compare {selected.size} Models
        </button>
      </div>
    </div>
  );
}
