import { useCallback } from 'react';
import type { AgentConfig } from '../../store/AgentContext';

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
      <div className="agent-card-header">
        <span className="agent-icon">{agent.icon || '🤖'}</span>
        <div className="agent-info">
          <h3 className="agent-name">{agent.name}</h3>
          <p className="agent-description">{agent.description}</p>
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

      <div className="agent-meta">
        <span className="agent-model">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
          {agent.defaultModel}
        </span>
        <span className="agent-tools">
          {agent.enabledTools.filter(t => t.enabled).length} tools
        </span>
      </div>

      <div className="agent-actions">
        <button
          className="btn-icon btn-sm"
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
          className="btn-icon btn-sm"
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
          className="btn-icon btn-sm"
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
          className="btn-icon btn-sm"
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

      {isActive && (
        <div className="active-indicator">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
          </svg>
          Active
        </div>
      )}
    </div>
  );
}
