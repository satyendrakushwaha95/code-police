import { useState, useEffect } from 'react';
import type { CompareModelEntry } from '../../hooks/useCompare';
import type { ProviderModel } from '../../services/ollama';
import { ollamaService } from '../../services/ollama';
import './Compare.css';

const ipcRenderer = (window as any).ipcRenderer;

interface ProviderInfo {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
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

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [models, providerList] = await Promise.all([
          ollamaService.listAllProviderModels(),
          ipcRenderer.invoke('provider:list'),
        ]);
        setAllModels(models);
        setProviders(providerList.filter((p: ProviderInfo) => p.enabled));
      } catch (err) {
        console.error('Failed to load models for comparison:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

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
    return <div className="compare-picker-loading">Loading models from all providers...</div>;
  }

  return (
    <div className="compare-model-picker">
      <div className="picker-header">
        <span className="picker-title">Select 2-4 models to compare</span>
        <span className="picker-count">{selected.size} selected</span>
      </div>

      <div className="picker-groups">
        {groupedByProvider.map(group => (
          group.models.length > 0 && (
            <div key={group.id} className="picker-group">
              <div className="picker-group-label">{group.name}</div>
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
          No models available. Add and enable providers in Settings → Providers.
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
