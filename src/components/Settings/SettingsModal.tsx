import { useState, useEffect } from 'react';
import { useSettings } from '../../store/SettingsContext';
import { ollamaService } from '../../services/ollama';
import type { OllamaModel } from '../../types/chat';
import ProviderSettingsPanel from './ProviderSettingsPanel';
import { useModelRouter, type TaskCategory } from '../../hooks/useModelRouter';
import { useToast } from '../../hooks/useToast';
import './Settings.css';

type SettingsTab = 'general' | 'providers';

interface SettingsModalProps {
  onClose: () => void;
}

const ROUTE_LABELS: Record<string, string> = {
  code_generation: 'Fix Generation',
  review: 'Security Review',
  planning: 'Scan Analysis',
  chat_general: 'Chat',
};

const ACTIVE_ROUTES: TaskCategory[] = ['code_generation', 'review', 'planning', 'chat_general'];

export default function SettingsModal({ onClose }: SettingsModalProps) {
  const { settings, updateSettings, resetSettings } = useSettings();
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [connectionOk, setConnectionOk] = useState<boolean | null>(null);
  const [tempEndpoint, setTempEndpoint] = useState(settings.endpoint);
  const { showToast } = useToast();

  const {
    config: routerConfig,
    availableModels,
    loading: routerLoading,
    setRoute,
    saveConfig,
    refreshModels: refreshRouterModels,
  } = useModelRouter();

  const [routerDirty, setRouterDirty] = useState(false);

  useEffect(() => {
    fetchModels();
  }, []);

  const fetchModels = async () => {
    setLoadingModels(true);
    try {
      ollamaService.setEndpoint(settings.endpoint);
      const m = await ollamaService.listModels();
      setModels(m);
      setConnectionOk(true);
    } catch {
      setModels([]);
      setConnectionOk(false);
    } finally {
      setLoadingModels(false);
    }
  };

  const handleTestConnection = async () => {
    setLoadingModels(true);
    try {
      ollamaService.setEndpoint(tempEndpoint);
      const ok = await ollamaService.checkConnection();
      setConnectionOk(ok);
      if (ok) {
        updateSettings({ endpoint: tempEndpoint });
        const m = await ollamaService.listModels();
        setModels(m);
        refreshRouterModels();
      }
    } catch {
      setConnectionOk(false);
    } finally {
      setLoadingModels(false);
    }
  };

  const handleSaveRouter = async () => {
    const result = await saveConfig();
    if (result.success) {
      showToast('Model routing saved', 'success');
      setRouterDirty(false);
    } else {
      showToast(`Error: ${result.errors.join(', ')}`, 'error');
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1e9) return `${(bytes / 1e6).toFixed(0)} MB`;
    return `${(bytes / 1e9).toFixed(1)} GB`;
  };

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-content settings-modal wide-modal">
        <div className="modal-header">
          <h2>Settings</h2>
          <button className="btn-icon" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="settings-tabs">
          <button
            className={`settings-tab ${activeTab === 'general' ? 'active' : ''}`}
            onClick={() => setActiveTab('general')}
          >
            General
          </button>
          <button
            className={`settings-tab ${activeTab === 'providers' ? 'active' : ''}`}
            onClick={() => setActiveTab('providers')}
          >
            Providers
          </button>
        </div>

        <div className="modal-body">
          {activeTab === 'general' && (
          <>
            {/* Connection */}
            <div className="settings-section">
              <h3 className="section-title">Connection</h3>
              <div className="form-group">
                <label>Ollama Endpoint</label>
                <div className="endpoint-row">
                  <input
                    type="text"
                    value={tempEndpoint}
                    onChange={(e) => setTempEndpoint(e.target.value)}
                    placeholder="http://localhost:11434"
                  />
                  <button className="btn btn-secondary" onClick={handleTestConnection} disabled={loadingModels}>
                    {loadingModels ? 'Testing...' : 'Test'}
                  </button>
                </div>
                {connectionOk !== null && (
                  <div className={`connection-result ${connectionOk ? 'success' : 'error'}`}>
                    <span className={`status-dot ${connectionOk ? 'connected' : 'disconnected'}`}></span>
                    {connectionOk ? 'Connected successfully!' : 'Connection failed. Is Ollama running?'}
                  </div>
                )}
              </div>
            </div>

            {/* Models */}
            <div className="settings-section">
              <h3 className="section-title">Models</h3>
              <div className="form-group">
                <label>Chat Model</label>
                <select
                  value={settings.model}
                  onChange={(e) => updateSettings({ model: e.target.value })}
                >
                  {models.length === 0 && (
                    <option value={settings.model}>{settings.model}</option>
                  )}
                  {models.map(m => (
                    <option key={m.name} value={m.name}>
                      {m.name} ({formatSize(m.size)})
                    </option>
                  ))}
                </select>
                <p className="hint">Model used for chat conversations</p>
              </div>

              <div className="form-group">
                <label>Embedding Model</label>
                <select
                  value={settings.embeddingModel}
                  onChange={(e) => updateSettings({ embeddingModel: e.target.value })}
                >
                  {models.length === 0 && (
                    <option value={settings.embeddingModel}>{settings.embeddingModel}</option>
                  )}
                  {models.map(m => (
                    <option key={m.name} value={m.name}>
                      {m.name} ({formatSize(m.size)})
                    </option>
                  ))}
                </select>
                <p className="hint">Model used for semantic code search during scans</p>
              </div>

              {models.length === 0 && !loadingModels && (
                <p className="hint error">No models found. Make sure Ollama is running and you have models pulled.</p>
              )}
            </div>

            {/* Scan Model Routing */}
            <div className="settings-section">
              <h3 className="section-title">Scan Model Routing</h3>
              <p className="hint" style={{ marginBottom: 12 }}>Choose which model to use for each scan task. Falls back to Chat Model if not set.</p>

              {routerLoading ? (
                <p className="hint">Loading routing config...</p>
              ) : routerConfig ? (
                <>
                  {ACTIVE_ROUTES.map(category => {
                    const route = routerConfig.routes[category];
                    if (!route) return null;
                    return (
                      <div className="form-group" key={category}>
                        <label>{ROUTE_LABELS[category] || category}</label>
                        <select
                          value={route.model}
                          onChange={(e) => { setRoute(category, e.target.value); setRouterDirty(true); }}
                          className="model-input model-select"
                        >
                          {availableModels.map(m => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                          {!availableModels.includes(route.model) && route.model && (
                            <option value={route.model}>{route.model} (not installed)</option>
                          )}
                        </select>
                      </div>
                    );
                  })}
                  {routerDirty && (
                    <button className="btn btn-primary btn-sm" onClick={handleSaveRouter} style={{ marginTop: 8 }}>
                      Save Routing
                    </button>
                  )}
                </>
              ) : null}
            </div>

            {/* LLM Parameters */}
            <div className="settings-section">
              <h3 className="section-title">LLM Parameters</h3>
              <div className="form-group">
                <label>Temperature</label>
                <div className="range-slider">
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={settings.temperature}
                    onChange={(e) => updateSettings({ temperature: parseFloat(e.target.value) })}
                  />
                  <span className="range-value">{settings.temperature.toFixed(1)}</span>
                </div>
                <p className="hint">Lower = more focused analysis, Higher = more creative responses</p>
              </div>
            </div>

            {/* System Prompt */}
            <div className="settings-section">
              <h3 className="section-title">Chat System Prompt</h3>
              <div className="form-group">
                <textarea
                  value={settings.systemPrompt}
                  onChange={(e) => updateSettings({ systemPrompt: e.target.value })}
                  rows={3}
                  placeholder="Enter a system prompt for the chat assistant..."
                  className="system-prompt-textarea"
                />
              </div>
            </div>

            {/* Appearance */}
            <div className="settings-section">
              <h3 className="section-title">Appearance</h3>
              <div className="form-group">
                <label>Theme</label>
                <div className="theme-toggle">
                  <button
                    className={`theme-btn ${settings.theme === 'dark' ? 'active' : ''}`}
                    onClick={() => updateSettings({ theme: 'dark' })}
                  >
                    Dark
                  </button>
                  <button
                    className={`theme-btn ${settings.theme === 'light' ? 'active' : ''}`}
                    onClick={() => updateSettings({ theme: 'light' })}
                  >
                    Light
                  </button>
                </div>
              </div>
            </div>
          </>
          )}

          {activeTab === 'providers' && (
            <ProviderSettingsPanel />
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={resetSettings}>Reset to Defaults</button>
          <button className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
