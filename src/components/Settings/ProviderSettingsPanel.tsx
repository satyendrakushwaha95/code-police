import { useState, useEffect, useCallback } from 'react';
import { useToast } from '../../hooks/useToast';
import './Settings.css';

const ipcRenderer = (window as any).ipcRenderer;

interface ProviderConfig {
  id: string;
  type: 'ollama' | 'openai_compatible' | 'anthropic';
  name: string;
  enabled: boolean;
  endpoint: string;
  apiKey: string | null;
  headers?: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}

interface ProviderPreset {
  type: 'ollama' | 'openai_compatible' | 'anthropic';
  name: string;
  enabled: boolean;
  endpoint: string;
  apiKey: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  ollama: 'Ollama',
  openai_compatible: 'OpenAI Compatible',
  anthropic: 'Anthropic',
};

const TYPE_COLORS: Record<string, string> = {
  ollama: '#4ade80',
  openai_compatible: '#60a5fa',
  anthropic: '#c084fc',
};

interface ConnectionStatus {
  [id: string]: 'connected' | 'disconnected' | 'checking';
}

export default function ProviderSettingsPanel() {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [presets, setPresets] = useState<Record<string, ProviderPreset>>({});
  const [loading, setLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({
    presetKey: '',
    name: '',
    type: 'openai_compatible' as ProviderConfig['type'],
    endpoint: '',
    apiKey: '',
  });
  const { showToast } = useToast();

  const loadProviders = useCallback(async () => {
    try {
      const list = await ipcRenderer.invoke('provider:list');
      setProviders(list);
    } catch (err) {
      console.error('Failed to load providers:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProviders();
    ipcRenderer.invoke('provider:getPresets').then((p: Record<string, ProviderPreset>) => {
      setPresets(p);
    }).catch(() => {});
  }, [loadProviders]);

  const testConnection = async (id: string) => {
    setConnectionStatus(prev => ({ ...prev, [id]: 'checking' }));
    try {
      const result = await ipcRenderer.invoke('provider:test', { id });
      setConnectionStatus(prev => ({ ...prev, [id]: result.connected ? 'connected' : 'disconnected' }));
    } catch {
      setConnectionStatus(prev => ({ ...prev, [id]: 'disconnected' }));
    }
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      await ipcRenderer.invoke('provider:update', { id, updates: { enabled } });
      await loadProviders();
    } catch (err: any) {
      showToast(`Failed to update provider: ${err.message}`, 'error');
    }
  };

  const handleDelete = async (id: string) => {
    const provider = providers.find(p => p.id === id);
    if (!provider) return;
    if (!confirm(`Remove "${provider.name}"? This cannot be undone.`)) return;
    try {
      await ipcRenderer.invoke('provider:remove', { id });
      await loadProviders();
      showToast(`Removed "${provider.name}"`, 'success');
    } catch (err: any) {
      showToast(`Failed to remove: ${err.message}`, 'error');
    }
  };

  const handleAdd = async () => {
    if (!addForm.name.trim() || !addForm.endpoint.trim()) {
      showToast('Name and endpoint are required', 'error');
      return;
    }
    try {
      const config: ProviderConfig = {
        id: `${addForm.type}-${Date.now()}`,
        type: addForm.type,
        name: addForm.name,
        enabled: true,
        endpoint: addForm.endpoint,
        apiKey: addForm.apiKey || null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const result = await ipcRenderer.invoke('provider:add', config);
      if (result.success) {
        showToast(`Added "${addForm.name}"`, 'success');
        setShowAddForm(false);
        setAddForm({ presetKey: '', name: '', type: 'openai_compatible', endpoint: '', apiKey: '' });
        await loadProviders();
      } else {
        showToast(`Failed: ${result.error}`, 'error');
      }
    } catch (err: any) {
      showToast(`Failed: ${err.message}`, 'error');
    }
  };

  const handlePresetSelect = (key: string) => {
    const preset = presets[key];
    if (!preset) return;
    setAddForm({
      presetKey: key,
      name: preset.name,
      type: preset.type,
      endpoint: preset.endpoint,
      apiKey: '',
    });
  };

  const handleUpdateProvider = async (id: string, updates: Partial<ProviderConfig>) => {
    try {
      const result = await ipcRenderer.invoke('provider:update', { id, updates });
      if (result.success) {
        showToast('Provider updated', 'success');
        setEditingId(null);
        await loadProviders();
      } else {
        showToast(`Failed: ${result.error}`, 'error');
      }
    } catch (err: any) {
      showToast(`Failed: ${err.message}`, 'error');
    }
  };

  if (loading) {
    return <div className="settings-loading">Loading providers...</div>;
  }

  return (
    <div className="provider-settings">
      <div className="provider-list">
        {providers.map(provider => (
          <div key={provider.id} className={`provider-card ${!provider.enabled ? 'disabled' : ''}`}>
            <div className="provider-card-header">
              <div className="provider-info">
                <span
                  className="provider-type-badge"
                  style={{ background: TYPE_COLORS[provider.type] + '22', color: TYPE_COLORS[provider.type] }}
                >
                  {TYPE_LABELS[provider.type]}
                </span>
                <span className="provider-name">{provider.name}</span>
              </div>
              <div className="provider-actions">
                <span
                  className={`status-dot ${connectionStatus[provider.id] || 'unknown'}`}
                  title={connectionStatus[provider.id] || 'Not tested'}
                ></span>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => testConnection(provider.id)}
                  disabled={connectionStatus[provider.id] === 'checking'}
                >
                  {connectionStatus[provider.id] === 'checking' ? 'Testing...' : 'Test'}
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setEditingId(editingId === provider.id ? null : provider.id)}
                >
                  Edit
                </button>
                <label className="toggle-switch toggle-sm">
                  <input
                    type="checkbox"
                    checked={provider.enabled}
                    onChange={(e) => handleToggle(provider.id, e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>
            </div>

            <div className="provider-endpoint">{provider.endpoint}</div>

            {editingId === provider.id && (
              <ProviderEditForm
                provider={provider}
                onSave={(updates) => handleUpdateProvider(provider.id, updates)}
                onCancel={() => setEditingId(null)}
                onDelete={() => handleDelete(provider.id)}
              />
            )}
          </div>
        ))}
      </div>

      {!showAddForm ? (
        <button className="btn btn-secondary add-provider-btn" onClick={() => setShowAddForm(true)}>
          + Add Provider
        </button>
      ) : (
        <div className="provider-add-form">
          <h4>Add Provider</h4>

          <div className="form-group">
            <label>Preset</label>
            <select
              value={addForm.presetKey}
              onChange={(e) => handlePresetSelect(e.target.value)}
              className="model-select"
            >
              <option value="">Choose a preset...</option>
              {Object.entries(presets).map(([key, preset]) => (
                <option key={key} value={key}>{preset.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Name</label>
            <input
              type="text"
              value={addForm.name}
              onChange={(e) => setAddForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g. My OpenAI"
            />
          </div>

          <div className="form-group">
            <label>Type</label>
            <select
              value={addForm.type}
              onChange={(e) => setAddForm(prev => ({ ...prev, type: e.target.value as ProviderConfig['type'] }))}
              className="model-select"
            >
              <option value="ollama">Ollama</option>
              <option value="openai_compatible">OpenAI Compatible</option>
              <option value="anthropic">Anthropic</option>
            </select>
          </div>

          <div className="form-group">
            <label>Endpoint</label>
            <input
              type="text"
              value={addForm.endpoint}
              onChange={(e) => setAddForm(prev => ({ ...prev, endpoint: e.target.value }))}
              placeholder="https://api.openai.com/v1"
            />
          </div>

          {addForm.type !== 'ollama' && (
            <div className="form-group">
              <label>API Key</label>
              <input
                type="password"
                value={addForm.apiKey}
                onChange={(e) => setAddForm(prev => ({ ...prev, apiKey: e.target.value }))}
                placeholder="sk-..."
              />
            </div>
          )}

          <div className="form-actions">
            <button className="btn btn-ghost" onClick={() => setShowAddForm(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleAdd}>Add Provider</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ProviderEditForm({
  provider,
  onSave,
  onCancel,
  onDelete,
}: {
  provider: ProviderConfig;
  onSave: (updates: Partial<ProviderConfig>) => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(provider.name);
  const [endpoint, setEndpoint] = useState(provider.endpoint);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);

  return (
    <div className="provider-edit-form">
      <div className="form-group">
        <label>Name</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="form-group">
        <label>Endpoint</label>
        <input type="text" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} />
      </div>
      {provider.type !== 'ollama' && (
        <div className="form-group">
          <label>API Key {provider.apiKey && '(currently set)'}</label>
          <div className="endpoint-row">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Leave empty to keep current key"
            />
            <button className="btn btn-ghost btn-sm" onClick={() => setShowKey(!showKey)}>
              {showKey ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>
      )}
      <div className="form-actions">
        <button className="btn btn-danger btn-sm" onClick={onDelete}>Delete</button>
        <div style={{ flex: 1 }} />
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => {
            const updates: Partial<ProviderConfig> = { name, endpoint };
            if (apiKey) updates.apiKey = apiKey;
            onSave(updates);
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
}
