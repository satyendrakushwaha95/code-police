import { useState, useEffect, useCallback } from 'react';
import { useModelRouter, type TaskCategory, type RouteConfig } from '../../hooks/useModelRouter';
import { useToast } from '../../hooks/useToast';
import './Settings.css';

interface RoutingSettingsPanelProps {
  onClose: () => void;
  embedded?: boolean;
}

const CATEGORY_LABELS: Record<TaskCategory, string> = {
  code_generation: 'Fix Generation',
  code_refactor: 'Code Refactor (unused)',
  documentation: 'Documentation (unused)',
  planning: 'Scan Analysis',
  review: 'Security Review',
  chat_general: 'Chat (General)',
};

interface ModelAvailability {
  [model: string]: 'valid' | 'invalid' | 'checking';
}

export default function RoutingSettingsPanel({ onClose, embedded = false }: RoutingSettingsPanelProps) {
  const {
    config,
    availableModels,
    loading,
    setRoute,
    setDefaultModel,
    toggleRoute,
    saveConfig,
    validateModel,
    refreshModels,
  } = useModelRouter();
  
  const { showToast } = useToast();
  const [modelAvailability, setModelAvailability] = useState<ModelAvailability>({});
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const checkModelAvailability = useCallback(async (model: string) => {
    setModelAvailability(prev => ({ ...prev, [model]: 'checking' }));
    const isValid = await validateModel(model);
    setModelAvailability(prev => ({ ...prev, [model]: isValid ? 'valid' : 'invalid' }));
  }, [validateModel]);

  useEffect(() => {
    if (config) {
      Object.values(config.routes).forEach((route: RouteConfig) => {
        if (!(route.model in modelAvailability)) {
          checkModelAvailability(route.model);
        }
      });
    }
  }, [config, checkModelAvailability, modelAvailability]);

  const handleModelChange = (category: TaskCategory, model: string) => {
    setHasChanges(true);
    setRoute(category, model);
    setModelAvailability(prev => ({ ...prev, [model]: 'checking' }));
    
    const timeoutId = setTimeout(() => {
      checkModelAvailability(model);
    }, 500);

    return () => clearTimeout(timeoutId);
  };

  const handleToggle = (category: TaskCategory, enabled: boolean) => {
    setHasChanges(true);
    toggleRoute(category, enabled);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await saveConfig();
      if (result.success) {
        showToast('Routing configuration saved!', 'success');
        setHasChanges(false);
      } else {
        showToast(`Error: ${result.errors.join(', ')}`, 'error');
      }
    } catch (err) {
      showToast('Failed to save configuration', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRefreshModels = async () => {
    await refreshModels();
    if (config) {
      Object.values(config.routes).forEach((route: RouteConfig) => {
        checkModelAvailability(route.model);
      });
    }
  };

  if (loading) {
    return (
      <div className="settings-panel">
        <div className="settings-loading">Loading routing configuration...</div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="settings-panel">
        <div className="settings-error">Failed to load routing configuration</div>
      </div>
    );
  }

  return (
    <div className={`settings-panel routing-settings ${embedded ? 'embedded' : ''}`}>
      {!embedded && (
        <div className="settings-header">
          <div className="header-with-close">
            <h2>Model Routing</h2>
            <button className="btn-icon" onClick={onClose}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <p className="settings-description">
            Configure which AI model to use for different task types
          </p>
        </div>
      )}

      {availableModels.length === 0 && (
        <div className="warning-banner">
          <span className="warning-icon">⚠️</span>
          <span>Ollama is not running or no models are available. Please start Ollama and pull some models.</span>
        </div>
      )}

      <div className="routing-table">
        <div className="routing-header">
          <div className="col-category">Task Category</div>
          <div className="col-model">Model</div>
          <div className="col-status">Status</div>
          <div className="col-toggle">Enabled</div>
        </div>

        {(Object.keys(config.routes) as TaskCategory[]).map((category) => {
          const route = config.routes[category];
          const availability = modelAvailability[route.model] || 'checking';
          
          return (
            <div key={category} className="routing-row">
              <div className="col-category">
                <span className="category-label">{CATEGORY_LABELS[category]}</span>
              </div>
              <div className="col-model">
                <select
                  value={route.model}
                  onChange={(e) => handleModelChange(category, e.target.value)}
                  className="model-input model-select"
                >
                  <option value="" disabled>Select a model...</option>
                  {availableModels.map(model => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                  {!availableModels.includes(route.model) && route.model && (
                    <option value={route.model}>{route.model} (not installed)</option>
                  )}
                </select>
              </div>
              <div className="col-status">
                <span className={`status-indicator ${availability}`} title={route.model}>
                  {availability === 'valid' && '●'}
                  {availability === 'invalid' && '●'}
                  {availability === 'checking' && '○'}
                </span>
              </div>
              <div className="col-toggle">
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={route.enabled}
                    onChange={(e) => handleToggle(category, e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>
            </div>
          );
        })}
      </div>

      <div className="default-model-section">
        <h3>Default Model</h3>
        <p className="hint">This model is used when a category is disabled or the preferred model is unavailable</p>
        <select
          value={config.defaultModel}
          onChange={(e) => {
            setHasChanges(true);
            setDefaultModel(e.target.value);
            checkModelAvailability(e.target.value);
          }}
          className="model-input model-select"
        >
          {availableModels.map(model => (
            <option key={model} value={model}>{model}</option>
          ))}
          {!availableModels.includes(config.defaultModel) && config.defaultModel && (
            <option value={config.defaultModel}>{config.defaultModel} (not installed)</option>
          )}
        </select>
      </div>

      <div className="settings-actions">
        <button className="btn btn-secondary" onClick={handleRefreshModels}>
          Refresh Models
        </button>
        <button 
          className="btn btn-primary" 
          onClick={handleSave}
          disabled={saving || !hasChanges}
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
