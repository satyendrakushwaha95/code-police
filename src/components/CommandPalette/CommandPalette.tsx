import { useState, useRef, useEffect, useCallback } from 'react';
import { useConversations } from '../../store/ConversationContext';
import { useSettings } from '../../store/SettingsContext';
import { isCommand, routeCommand } from '../../services/command-router';
import './CommandPalette.css';

interface CommandPaletteProps {
  onClose: () => void;
  onAction: (action: string, payload?: any) => void;
}

interface PaletteItem {
  id: string;
  label: string;
  description?: string;
  icon: string;
  category: 'action' | 'conversation' | 'command';
  action: () => void;
}

export default function CommandPalette({ onClose, onAction }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [executing, setExecuting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { state } = useConversations();
  const { settings } = useSettings();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const actions: PaletteItem[] = [
    { id: 'new-chat', label: 'New Chat', icon: '💬', category: 'action', action: () => onAction('new_chat') },
    { id: 'scan', label: 'Scan Dashboard', description: 'Security scan overview', icon: '🔍', category: 'action', action: () => onAction('scan') },
    { id: 'findings', label: 'Findings', icon: '🛡️', category: 'action', action: () => onAction('findings') },
    { id: 'report', label: 'Report', icon: '📑', category: 'action', action: () => onAction('report') },
    { id: 'files', label: 'File Explorer', icon: '📂', category: 'action', action: () => onAction('files') },
    { id: 'onboard', label: 'Onboard Project', description: 'Analyze & understand current project', icon: '📋', category: 'action', action: () => onAction('onboard') },
    { id: 'usage', label: 'Usage & Costs', icon: '📊', category: 'action', action: () => onAction('usage') },
    { id: 'settings', label: 'Settings', icon: '⚙️', category: 'action', action: () => onAction('settings') },
    { id: 'shortcuts', label: 'Keyboard Shortcuts', icon: '⌨️', category: 'action', action: () => onAction('shortcuts') },
  ];

  const conversations: PaletteItem[] = state.conversations.slice(0, 10).map(conv => ({
    id: `conv-${conv.id}`,
    label: conv.title,
    description: new Date(conv.updatedAt).toLocaleDateString(),
    icon: '💬',
    category: 'conversation' as const,
    action: () => onAction('switch_conversation', conv.id),
  }));

  const allItems = [...actions, ...conversations];

  const filtered = query
    ? allItems.filter(item =>
        item.label.toLowerCase().includes(query.toLowerCase()) ||
        item.description?.toLowerCase().includes(query.toLowerCase())
      )
    : allItems;

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const executeSelected = useCallback(async () => {
    // Check if the query itself is a command (like "run npm test")
    if (query && isCommand(query)) {
      setExecuting(true);
      const result = await routeCommand(query);
      if (result.executed && result.uiAction) {
        onAction(result.uiAction);
      }
      onClose();
      return;
    }

    if (filtered.length > 0 && selectedIndex < filtered.length) {
      filtered[selectedIndex].action();
      onClose();
    }
  }, [filtered, selectedIndex, query, onAction, onClose]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        executeSelected();
        break;
      case 'Escape':
        onClose();
        break;
    }
  };

  return (
    <div className="command-palette-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="command-palette">
        <div className="command-palette-input-wrapper">
          <svg className="command-palette-search-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command, search conversations..."
            className="command-palette-input"
          />
          <kbd className="command-palette-kbd">ESC</kbd>
        </div>

        <div className="command-palette-results">
          {filtered.length === 0 && (
            <div className="command-palette-empty">
              {query ? `No results for "${query}"` : 'Start typing...'}
            </div>
          )}

          {filtered.length > 0 && (
            <>
              {['action', 'conversation'].map(category => {
                const items = filtered.filter(f => f.category === category);
                if (items.length === 0) return null;
                return (
                  <div key={category} className="command-palette-group">
                    <div className="command-palette-group-label">
                      {category === 'action' ? 'Actions' : 'Conversations'}
                    </div>
                    {items.map((item) => {
                      const globalIdx = filtered.indexOf(item);
                      return (
                        <div
                          key={item.id}
                          className={`command-palette-item ${globalIdx === selectedIndex ? 'selected' : ''}`}
                          onClick={() => { item.action(); onClose(); }}
                          onMouseEnter={() => setSelectedIndex(globalIdx)}
                        >
                          <span className="command-palette-item-icon">{item.icon}</span>
                          <span className="command-palette-item-label">{item.label}</span>
                          {item.description && (
                            <span className="command-palette-item-desc">{item.description}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </>
          )}
        </div>

        <div className="command-palette-footer">
          <span><kbd>↑↓</kbd> navigate</span>
          <span><kbd>↵</kbd> select</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
