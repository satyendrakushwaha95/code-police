import { useState, useEffect } from 'react';
import { useSettings } from '../../store/SettingsContext';
import { ollamaService } from '../../services/ollama';
import type { OllamaModel } from '../../types/chat';
import RoutingSettingsPanel from './RoutingSettingsPanel';
import ProviderSettingsPanel from './ProviderSettingsPanel';
import ProfileSettingsPanel from './ProfileSettingsPanel';
import './Settings.css';

type SettingsTab = 'general' | 'profile' | 'providers' | 'modelrouter';

interface SettingsModalProps {
  onClose: () => void;
}

export default function SettingsModal({ onClose }: SettingsModalProps) {
  const { settings, updateSettings, resetSettings } = useSettings();
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [connectionOk, setConnectionOk] = useState<boolean | null>(null);
  const [tempEndpoint, setTempEndpoint] = useState(settings.endpoint);

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
      }
    } catch {
      setConnectionOk(false);
    } finally {
      setLoadingModels(false);
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
          <h2>⚙️ Settings</h2>
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
            className={`settings-tab ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => setActiveTab('profile')}
          >
            Profile & Memory
          </button>
          <button 
            className={`settings-tab ${activeTab === 'providers' ? 'active' : ''}`}
            onClick={() => setActiveTab('providers')}
          >
            Providers
          </button>
          <button 
            className={`settings-tab ${activeTab === 'modelrouter' ? 'active' : ''}`}
            onClick={() => setActiveTab('modelrouter')}
          >
            Model Router
          </button>
        </div>

        <div className="modal-body">
          {activeTab === 'general' && (
          <>
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
                <p className="hint">Model used for semantic search (use nomic-embed-text or mxbai-embed-large)</p>
              </div>

              {models.length === 0 && !loadingModels && (
                <p className="hint error">⚠️ No models found. Make sure Ollama is running and you have models pulled.</p>
              )}
            </div>

            <div className="settings-section">
              <h3 className="section-title">Parameters</h3>

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
                <p className="hint">Lower = more focused, Higher = more creative</p>
              </div>

              <div className="form-group">
                <label>Top P</label>
                <div className="range-slider">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={settings.topP}
                    onChange={(e) => updateSettings({ topP: parseFloat(e.target.value) })}
                  />
                  <span className="range-value">{settings.topP.toFixed(2)}</span>
                </div>
              </div>

              <div className="form-group">
                <label>Context Length</label>
                <div className="range-slider">
                  <input
                    type="range"
                    min="1024"
                    max="131072"
                    step="1024"
                    value={settings.contextLength}
                    onChange={(e) => updateSettings({ contextLength: parseInt(e.target.value) })}
                  />
                  <span className="range-value">{settings.contextLength >= 1024 ? `${(settings.contextLength / 1024).toFixed(0)}K` : settings.contextLength}</span>
                </div>
              </div>
            </div>

            <div className="settings-section">
              <h3 className="section-title">Default Workspace</h3>
              <div className="form-group">
                <label>Default Project Directory</label>
                <p className="form-hint">Set a default project directory so scans start automatically without manually opening a folder each time.</p>
                <div className="endpoint-row">
                  <input
                    type="text"
                    value={settings.defaultWorkspacePath || ''}
                    onChange={(e) => updateSettings({ defaultWorkspacePath: e.target.value })}
                    placeholder="e.g., D:\Projects\my-app"
                  />
                  <button
                    className="btn btn-secondary"
                    onClick={async () => {
                      try {
                        const result = await (window as any).ipcRenderer?.invoke('dialog:openDirectoryPath');
                        if (result) {
                          updateSettings({ defaultWorkspacePath: result });
                        }
                      } catch {
                        const result = await (window as any).ipcRenderer?.invoke('dialog:openDirectory');
                        if (result?.rootPath) {
                          updateSettings({ defaultWorkspacePath: result.rootPath });
                        }
                      }
                    }}
                  >
                    Browse
                  </button>
                </div>
              </div>
            </div>

            <div className="settings-section">
              <h3 className="section-title">System Prompt</h3>
              <div className="form-group">
                <textarea
                  value={settings.systemPrompt}
                  onChange={(e) => updateSettings({ systemPrompt: e.target.value })}
                  rows={4}
                  placeholder="Enter a system prompt..."
                  className="system-prompt-textarea"
                />
              </div>
            </div>

            <div className="settings-section">
              <h3 className="section-title">Appearance</h3>
              <div className="form-group">
                <label>Theme</label>
                <div className="theme-toggle">
                  <button
                    className={`theme-btn ${settings.theme === 'dark' ? 'active' : ''}`}
                    onClick={() => updateSettings({ theme: 'dark' })}
                  >
                    🌙 Dark
                  </button>
                  <button
                    className={`theme-btn ${settings.theme === 'light' ? 'active' : ''}`}
                    onClick={() => updateSettings({ theme: 'light' })}
                  >
                    ☀️ Light
                  </button>
                </div>
              </div>
            </div>
          </>
          )}

          {activeTab === 'profile' && (
            <ProfileSettingsPanel />
          )}

          {activeTab === 'providers' && (
            <ProviderSettingsPanel />
          )}

          {activeTab === 'modelrouter' && (
            <RoutingSettingsPanel onClose={() => {}} embedded={true} />
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
