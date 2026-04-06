import { useCallback, useState, useEffect } from 'react';
import type { AgentConfig } from '../../store/AgentContext';

const ipcRenderer = (window as any).ipcRenderer;

interface AgentCardProps {
  agent: AgentConfig;
  isActive: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onClone: () => void;
  onExport: () => void;
  onDelete: () => void;
}

export default function AgentCard({
  agent,
  isActive,
  onSelect,
  onEdit,
  onClone,
  onExport,
  onDelete,
}: AgentCardProps) {
  const [usageStats, setUsageStats] = useState<{ requests: number; tokens: number } | null>(null);

  useEffect(() => {
    if (!ipcRenderer) return;
    ipcRenderer.invoke('usage:getRecent', { limit: 500 }).then((records: any[]) => {
      const agentRecords = records.filter((r: any) =>
        r.conversationId?.includes(`pipeline:`) && r.messageId?.includes(agent.id)
      );
      if (agentRecords.length > 0) {
        setUsageStats({
          requests: agentRecords.length,
          tokens: agentRecords.reduce((sum: number, r: any) => sum + (r.totalTokens || 0), 0),
        });
      }
    }).catch(() => {});
  }, [agent.id]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  const isDefault = agent.id.startsWith('default-');

  return (
    <div
      className={`agent-card ${isActive ? 'active' : ''}`}
      onClick={onSelect}
      onContextMenu={handleContextMenu}
    >
      <div className="agent-card-top">
        <div className="agent-card-avatar" aria-hidden>
          <span className="agent-icon">{agent.icon || '🤖'}</span>
        </div>
        <div className="agent-card-main">
          <div className="agent-card-title-row">
            <h3 className="agent-name">{agent.name}</h3>
            {isActive && (
              <span className="agent-active-pill">
                <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor" aria-hidden>
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                </svg>
                Active
              </span>
            )}
          </div>
          <p className="agent-description">{agent.description || 'No description'}</p>
        </div>
        <div className="agent-actions">
          <button
          className="btn-icon"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          title="Edit"
        >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
          <button
          className="btn-icon"
          onClick={(e) => {
            e.stopPropagation();
            onClone();
          }}
          title="Clone"
        >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
            </svg>
          </button>
          <button
          className="btn-icon"
          onClick={(e) => {
            e.stopPropagation();
            onExport();
          }}
          title="Export"
        >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </button>
          <button
          className="btn-icon"
          onClick={(e) => {
            e.stopPropagation();
            if (!isDefault && confirm(`Delete ${agent.name}?`)) {
              onDelete();
            } else if (isDefault) {
              alert('Cannot delete default agents');
            }
          }}
          title="Delete"
          disabled={isDefault}
        >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
            </svg>
          </button>
        </div>
      </div>

      {agent.tags.length > 0 && (
        <div className="agent-tags">
          {agent.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="tag">
              {tag}
            </span>
          ))}
          {agent.tags.length > 3 && (
            <span className="tag more">+{agent.tags.length - 3}</span>
          )}
        </div>
      )}

      <div className="agent-card-footer">
        <div className="agent-meta">
          <span className="agent-model" title={agent.defaultModel}>
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
            <span className="agent-model-text">{agent.defaultModel}</span>
          </span>
          <span className="agent-tools-pill">
            {agent.enabledTools.filter(t => t.enabled).length} tools
          </span>
        </div>
        {usageStats && (
          <div className="agent-usage-stats">
            <span>{usageStats.requests} runs</span>
            <span>{usageStats.tokens > 1000 ? `${(usageStats.tokens/1000).toFixed(1)}K` : usageStats.tokens} tokens</span>
          </div>
        )}
      </div>
    </div>
  );
}
