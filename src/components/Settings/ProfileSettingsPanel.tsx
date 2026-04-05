import { useState, useEffect, useCallback } from 'react';
import { useToast } from '../../hooks/useToast';
import './Settings.css';

const ipcRenderer = (window as any).ipcRenderer;

interface UserProfile {
  name: string;
  role: string;
  timezone: string;
  expertiseAreas: string[];
  preferredLanguages: string[];
  personalityMode: string;
  customTraits: string;
}

interface PersonalityMode {
  id: string;
  label: string;
  description: string;
}

interface MemoryFact {
  id: number;
  category: string;
  content: string;
  source: string;
  importance: number;
  createdAt: number;
  lastAccessedAt: number;
  accessCount: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  core: 'Core',
  preference: 'Preference',
  decision: 'Decision',
  pattern: 'Pattern',
  project: 'Project',
  correction: 'Correction',
  general: 'General',
};

const CATEGORY_COLORS: Record<string, string> = {
  core: '#f59e0b',
  preference: '#8b5cf6',
  decision: '#3b82f6',
  pattern: '#10b981',
  project: '#ec4899',
  correction: '#ef4444',
  general: '#6b7280',
};

export default function ProfileSettingsPanel() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [modes, setModes] = useState<PersonalityMode[]>([]);
  const [memories, setMemories] = useState<MemoryFact[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<'profile' | 'personality' | 'memories'>('profile');
  const [editingMemory, setEditingMemory] = useState<number | null>(null);
  const [editContent, setEditContent] = useState('');
  const [newExpertise, setNewExpertise] = useState('');
  const [newLanguage, setNewLanguage] = useState('');
  const { showToast } = useToast();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [profileData, modesData, memoriesData] = await Promise.all([
        ipcRenderer.invoke('profile:get'),
        ipcRenderer.invoke('profile:getPersonalityModes'),
        ipcRenderer.invoke('memory:getAll'),
      ]);
      setProfile(profileData);
      setModes(modesData);
      setMemories(memoriesData);
    } catch (err) {
      console.error('Failed to load profile data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const saveProfile = async (updates: Partial<UserProfile>) => {
    try {
      await ipcRenderer.invoke('profile:update', updates);
      setProfile(prev => prev ? { ...prev, ...updates } : null);
      showToast('Profile saved', 'success');
    } catch {
      showToast('Failed to save profile', 'error');
    }
  };

  const deleteMemory = async (id: number) => {
    await ipcRenderer.invoke('memory:delete', { id });
    setMemories(prev => prev.filter(m => m.id !== id));
  };

  const updateMemory = async (id: number) => {
    await ipcRenderer.invoke('memory:update', { id, updates: { content: editContent } });
    setMemories(prev => prev.map(m => m.id === id ? { ...m, content: editContent } : m));
    setEditingMemory(null);
  };

  const handleExport = async () => {
    const json = await ipcRenderer.invoke('memory:export');
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `localmind-memory-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Memory exported', 'success');
  };

  const handleImport = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      try {
        const result = await ipcRenderer.invoke('memory:import', { json: text });
        showToast(`Imported ${result.memoriesImported} memories`, 'success');
        loadData();
      } catch (err: any) {
        showToast(`Import failed: ${err.message}`, 'error');
      }
    };
    input.click();
  };

  const handleDecay = async () => {
    const result = await ipcRenderer.invoke('memory:applyDecay');
    showToast(`Decay applied: ${result.decayed} decayed, ${result.deleted} removed`, 'info');
    loadData();
  };

  if (loading || !profile) {
    return <div className="settings-loading">Loading profile...</div>;
  }

  return (
    <div className="profile-settings">
      <div className="profile-section-tabs">
        {(['profile', 'personality', 'memories'] as const).map(s => (
          <button
            key={s}
            className={`profile-tab ${activeSection === s ? 'active' : ''}`}
            onClick={() => setActiveSection(s)}
          >
            {s === 'profile' ? 'Profile' : s === 'personality' ? 'Personality' : `Memories (${memories.length})`}
          </button>
        ))}
      </div>

      {activeSection === 'profile' && (
        <div className="profile-form">
          <div className="form-group">
            <label>Your Name</label>
            <input type="text" value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value })} onBlur={() => saveProfile({ name: profile.name })} placeholder="What should I call you?" />
          </div>
          <div className="form-group">
            <label>Role / Title</label>
            <input type="text" value={profile.role} onChange={e => setProfile({ ...profile, role: e.target.value })} onBlur={() => saveProfile({ role: profile.role })} placeholder="e.g. Full-Stack Developer, Data Scientist" />
          </div>
          <div className="form-group">
            <label>Timezone</label>
            <input type="text" value={profile.timezone} onChange={e => setProfile({ ...profile, timezone: e.target.value })} onBlur={() => saveProfile({ timezone: profile.timezone })} />
          </div>
          <div className="form-group">
            <label>Expertise Areas</label>
            <div className="tag-list">
              {profile.expertiseAreas.map((area, i) => (
                <span key={i} className="tag">{area} <button className="tag-remove" onClick={() => { const next = profile.expertiseAreas.filter((_, j) => j !== i); setProfile({ ...profile, expertiseAreas: next }); saveProfile({ expertiseAreas: next }); }}>x</button></span>
              ))}
              <div className="tag-input-row">
                <input type="text" value={newExpertise} onChange={e => setNewExpertise(e.target.value)} placeholder="Add area..." onKeyDown={e => { if (e.key === 'Enter' && newExpertise.trim()) { const next = [...profile.expertiseAreas, newExpertise.trim()]; setProfile({ ...profile, expertiseAreas: next }); saveProfile({ expertiseAreas: next }); setNewExpertise(''); } }} />
              </div>
            </div>
          </div>
          <div className="form-group">
            <label>Preferred Languages</label>
            <div className="tag-list">
              {profile.preferredLanguages.map((lang, i) => (
                <span key={i} className="tag">{lang} <button className="tag-remove" onClick={() => { const next = profile.preferredLanguages.filter((_, j) => j !== i); setProfile({ ...profile, preferredLanguages: next }); saveProfile({ preferredLanguages: next }); }}>x</button></span>
              ))}
              <div className="tag-input-row">
                <input type="text" value={newLanguage} onChange={e => setNewLanguage(e.target.value)} placeholder="Add language..." onKeyDown={e => { if (e.key === 'Enter' && newLanguage.trim()) { const next = [...profile.preferredLanguages, newLanguage.trim()]; setProfile({ ...profile, preferredLanguages: next }); saveProfile({ preferredLanguages: next }); setNewLanguage(''); } }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {activeSection === 'personality' && (
        <div className="personality-section">
          <p className="hint">Choose how the AI communicates with you</p>
          <div className="personality-grid">
            {modes.map(mode => (
              <button
                key={mode.id}
                className={`personality-card ${profile.personalityMode === mode.id ? 'active' : ''}`}
                onClick={() => { setProfile({ ...profile, personalityMode: mode.id }); saveProfile({ personalityMode: mode.id }); }}
              >
                <span className="personality-label">{mode.label}</span>
                <span className="personality-desc">{mode.description}</span>
              </button>
            ))}
          </div>
          <div className="form-group" style={{ marginTop: 16 }}>
            <label>Custom Traits (optional)</label>
            <textarea value={profile.customTraits} onChange={e => setProfile({ ...profile, customTraits: e.target.value })} onBlur={() => saveProfile({ customTraits: profile.customTraits })} placeholder="Additional personality instructions, e.g. 'Always suggest test cases' or 'Prefer functional programming patterns'" rows={3} className="system-prompt-textarea" />
          </div>
        </div>
      )}

      {activeSection === 'memories' && (
        <div className="memories-section">
          <div className="memories-actions-bar">
            <button className="btn btn-ghost btn-sm" onClick={handleExport}>Export</button>
            <button className="btn btn-ghost btn-sm" onClick={handleImport}>Import</button>
            <button className="btn btn-ghost btn-sm" onClick={handleDecay}>Run Decay</button>
          </div>
          {memories.length === 0 ? (
            <div className="usage-empty">
              <p>No memories stored yet.</p>
              <p className="usage-empty-hint">Say "remember that ..." in chat, or memories are auto-extracted from conversations.</p>
            </div>
          ) : (
            <div className="memory-list">
              {memories.map(m => (
                <div key={m.id} className="memory-item">
                  <div className="memory-item-header">
                    <span className="memory-category-badge" style={{ background: (CATEGORY_COLORS[m.category] || '#6b7280') + '22', color: CATEGORY_COLORS[m.category] || '#6b7280' }}>
                      {CATEGORY_LABELS[m.category] || m.category}
                    </span>
                    <span className="memory-importance" title={`Importance: ${m.importance.toFixed(1)}`}>
                      {'★'.repeat(Math.min(Math.round(m.importance), 5))}{'☆'.repeat(Math.max(5 - Math.round(m.importance), 0))}
                    </span>
                    <div className="memory-item-actions">
                      <button className="msg-action-btn" title="Edit" onClick={() => { setEditingMemory(m.id); setEditContent(m.content); }}>
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                      </button>
                      <button className="msg-action-btn delete" title="Delete" onClick={() => deleteMemory(m.id)}>
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                      </button>
                    </div>
                  </div>
                  {editingMemory === m.id ? (
                    <div className="memory-edit">
                      <textarea value={editContent} onChange={e => setEditContent(e.target.value)} rows={2} />
                      <div className="form-actions">
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditingMemory(null)}>Cancel</button>
                        <button className="btn btn-primary btn-sm" onClick={() => updateMemory(m.id)}>Save</button>
                      </div>
                    </div>
                  ) : (
                    <p className="memory-content">{m.content}</p>
                  )}
                  <div className="memory-meta">
                    <span>Source: {m.source}</span>
                    <span>Accessed {m.accessCount}x</span>
                    <span>{new Date(m.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
