import { useState, useMemo, useCallback, useEffect } from 'react';
import { useAgents, type AgentConfig } from '../../store/AgentContext';
import AgentCard from './AgentCard';
import AgentEditorModal from './AgentEditorModal';
import { useToast } from '../../hooks/useToast';
import './Agent.css';

interface AgentPanelProps {
  onClose: () => void;
}

export default function AgentPanel({ onClose }: AgentPanelProps) {
  const { state, setActiveAgent, deleteAgent, cloneAgent, exportAgent, importAgent } = useAgents();
  const { showToast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [showEditor, setShowEditor] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AgentConfig | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !showEditor) {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, showEditor]);

  const filteredAgents = useMemo(() => {
    if (!searchQuery.trim()) return state.agents;
    const query = searchQuery.toLowerCase();
    return state.agents.filter(
      agent =>
        agent.name.toLowerCase().includes(query) ||
        agent.description.toLowerCase().includes(query) ||
        agent.tags.some(tag => tag.toLowerCase().includes(query))
    );
  }, [state.agents, searchQuery]);

  const handleAgentSelect = useCallback(async (agent: AgentConfig) => {
    try {
      await setActiveAgent(agent.id);
      showToast(`Switched to ${agent.name}`, 'success');
    } catch (err) {
      showToast('Failed to select agent', 'error');
    }
  }, [setActiveAgent, showToast]);

  const handleEdit = useCallback((agent: AgentConfig) => {
    setEditingAgent(agent);
    setShowEditor(true);
  }, []);

  const handleClone = useCallback(async (agent: AgentConfig) => {
    try {
      const newName = `${agent.name} (Copy)`;
      await cloneAgent(agent.id, newName);
      showToast(`Cloned agent: ${agent.name}`, 'success');
    } catch (err) {
      showToast('Failed to clone agent', 'error');
    }
  }, [cloneAgent, showToast]);

  const handleExport = useCallback(async (agent: AgentConfig) => {
    try {
      const json = await exportAgent(agent.id);
      if (json) {
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${agent.name.replace(/[^a-z0-9]/gi, '_')}.agent.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast(`Exported ${agent.name}`, 'success');
      }
    } catch (err) {
      showToast('Failed to export agent', 'error');
    }
  }, [exportAgent, showToast]);

  const handleDelete = useCallback(async (agent: AgentConfig) => {
    try {
      await deleteAgent(agent.id);
      showToast(`Deleted ${agent.name}`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to delete agent', 'error');
    }
  }, [deleteAgent, showToast]);

  const handleImport = useCallback(async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        await importAgent(text);
        showToast(`Imported ${file.name}`, 'success');
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Failed to import agent', 'error');
      }
    };
    input.click();
  }, [importAgent, showToast]);

  const handleNewAgent = useCallback(() => {
    setEditingAgent(null);
    setShowEditor(true);
  }, []);

  const handleEditorClose = useCallback(() => {
    setShowEditor(false);
    setEditingAgent(null);
  }, []);

  return (
    <div
      className="agent-panel-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="agent-panel-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="agent-panel-modal" onClick={(e) => e.stopPropagation()}>
        <div className="panel-header">
          <h2 className="panel-title" id="agent-panel-title">
            Agents
            {!state.isLoading && (
              <span className="panel-title-count" aria-label={`${state.agents.length} agents`}>
                {state.agents.length}
              </span>
            )}
          </h2>
          <div className="panel-actions">
            <input
              type="search"
              placeholder="Search agents…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="agent-panel-header-search"
              autoComplete="off"
              aria-label="Search agents"
            />
            <button
              className="btn btn-sm"
              onClick={handleImport}
              title="Import Agent"
            >
              Import
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={handleNewAgent}
            >
              + New Agent
            </button>
            <button
              className="btn-icon"
              onClick={onClose}
              title="Close"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        <div className="panel-content">
          {state.isLoading ? (
            <div className="loading-state">Loading agents...</div>
          ) : filteredAgents.length === 0 ? (
            <div className="empty-state">
              {searchQuery ? (
                <p>No agents match your search</p>
              ) : (
                <>
                  <p>No agents yet</p>
                  <button className="btn btn-primary" onClick={handleNewAgent}>
                    Create Your First Agent
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="agent-list">
              {filteredAgents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  isActive={state.activeAgent?.id === agent.id}
                  onSelect={() => handleAgentSelect(agent)}
                  onEdit={() => handleEdit(agent)}
                  onClone={() => handleClone(agent)}
                  onExport={() => handleExport(agent)}
                  onDelete={() => handleDelete(agent)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {showEditor && (
        <AgentEditorModal
          agent={editingAgent}
          onClose={handleEditorClose}
        />
      )}
    </div>
  );
}
