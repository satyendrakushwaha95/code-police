import { useState, useRef, useEffect } from 'react';
import { useConversations } from '../../store/ConversationContext';
import { useSettings } from '../../store/SettingsContext';
import { formatTimestamp, truncateText } from '../../utils/helpers';
import './Sidebar.css';

interface SidebarProps {
  onOpenSettings: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onOpenChat?: () => void;
  onOpenUsage?: () => void;
  onOpenDashboard?: () => void;
  onOpenFindings?: () => void;
  onOpenReport?: () => void;
  onOpenHistory?: () => void;
}

export default function Sidebar({ 
  onOpenSettings, 
  isCollapsed, 
  onToggleCollapse,
  onOpenChat,
  onOpenUsage,
  onOpenDashboard,
  onOpenFindings,
  onOpenReport,
  onOpenHistory,
}: SidebarProps) {
  const { state, dispatch } = useConversations();
  const { settings } = useSettings();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const sidebarRef = useRef<HTMLElement>(null);
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const isResizing = useRef(false);
  const [menuOpen, setMenuOpen] = useState(true);
  const [chatsOpen, setChatsOpen] = useState(true);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const newWidth = Math.max(200, Math.min(500, e.clientX));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    if (sidebarRef.current) {
      sidebarRef.current.style.width = `${sidebarWidth}px`;
    }
  }, [sidebarWidth]);

  const handleNewChat = () => {
    dispatch({ type: 'CREATE_CONVERSATION', payload: { model: settings.model } });
  };

  const handleSelectConversation = (id: string) => {
    dispatch({ type: 'SET_ACTIVE', payload: id });
    onOpenChat?.();
  };

  const handleDeleteConversation = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    dispatch({ type: 'DELETE_CONVERSATION', payload: id });
  };

  const handleStartRename = (id: string, currentTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(id);
    setEditTitle(currentTitle);
    setTimeout(() => editInputRef.current?.focus(), 50);
  };

  const handleFinishRename = () => {
    if (editingId && editTitle.trim()) {
      dispatch({ type: 'RENAME_CONVERSATION', payload: { id: editingId, title: editTitle.trim() } });
    }
    setEditingId(null);
  };

  const filteredConversations = state.conversations.filter(c =>
    !searchQuery || c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isCollapsed) {
    return (
      <aside className="sidebar sidebar-collapsed" ref={sidebarRef} style={{ width: '56px' }}>
        <div className="sidebar-collapsed-actions">
          <div className="window-controls window-controls-collapsed">
            <button className="window-btn close" onClick={() => (window as any).ipcRenderer?.send('window:close')} title="Close">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
            <button className="window-btn minimize" onClick={() => (window as any).ipcRenderer?.send('window:minimize')} title="Minimize">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
            <button className="window-btn maximize" onClick={() => (window as any).ipcRenderer?.send('window:maximize')} title="Maximize">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
            </button>
          </div>
          <button className="btn-icon" onClick={onToggleCollapse} title="Expand sidebar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
          </button>
          <button className="btn-icon" onClick={handleNewChat} title="New chat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
          </button>
        </div>
      </aside>
    );
  }

  const chevronSvg = (collapsed: boolean) => (
    <svg className={`sidebar-section-chevron ${collapsed ? 'collapsed' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
  );

  return (
    <aside className="sidebar" ref={sidebarRef} style={{ width: `${sidebarWidth}px` }}>
      <div className="sidebar-resize-handle" onMouseDown={startResize} />

      <div className="sidebar-header">
        <div className="window-controls">
          <button className="window-btn close" onClick={() => (window as any).ipcRenderer?.send('window:close')} title="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
          <button className="window-btn minimize" onClick={() => (window as any).ipcRenderer?.send('window:minimize')} title="Minimize">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          <button className="window-btn maximize" onClick={() => (window as any).ipcRenderer?.send('window:maximize')} title="Maximize">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
          </button>
        </div>
        <div className="sidebar-brand">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="var(--accent)" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          <span className="brand-name">Code Police</span>
        </div>
        <button className="btn-icon" onClick={onToggleCollapse} title="Collapse sidebar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
      </div>

      <button className="new-chat-btn" onClick={handleNewChat}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
        New Chat
      </button>

      {/* Single scrollable body with two collapsible sections */}
      <div className="sidebar-body">

        {/* ── Section 1: Menu ── */}
        <div className="sidebar-section">
          <div className="sidebar-section-header" onClick={() => setMenuOpen(!menuOpen)}>
            <span className="sidebar-section-label">Menu</span>
            {chevronSvg(!menuOpen)}
          </div>
          {menuOpen && (
            <div className="sidebar-section-items">
              <button className="sidebar-menu-item" onClick={onOpenDashboard}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
                Scan Dashboard
              </button>
              <button className="sidebar-menu-item" onClick={onOpenFindings}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                Findings
              </button>
              <button className="sidebar-menu-item" onClick={onOpenReport}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                Scan Report
              </button>
              <button className="sidebar-menu-item" onClick={onOpenHistory}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                Scan History
              </button>

              <div className="sidebar-divider" />

              <button className="sidebar-menu-item" onClick={onOpenChat}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                Chat
              </button>
              <button className="sidebar-menu-item" onClick={onOpenUsage}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12V7H5a2 2 0 010-4h14v4"/><path d="M3 5v14a2 2 0 002 2h16v-5"/><path d="M18 12a2 2 0 000 4h4v-4z"/></svg>
                Usage & Costs
              </button>
              <button className="sidebar-menu-item" onClick={onOpenSettings}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
                Settings
              </button>
            </div>
          )}
        </div>

        <div className="sidebar-divider" />

        {/* ── Section 2: Chats ── */}
        <div className="sidebar-section">
          <div className="sidebar-section-header" onClick={() => setChatsOpen(!chatsOpen)}>
            <span className="sidebar-section-label">Chats ({state.conversations.length})</span>
            {chevronSvg(!chatsOpen)}
          </div>
          {chatsOpen && (
            <div className="sidebar-section-items">
              <div className="sidebar-search">
                <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                <input
                  type="text"
                  placeholder="Search chats..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="conversation-list">
                {filteredConversations.length === 0 && (
                  <div className="no-conversations">
                    <p>{searchQuery ? 'No matching chats' : 'No chats yet'}</p>
                  </div>
                )}
                {filteredConversations.map(conv => (
                  <div
                    key={conv.id}
                    className={`conversation-item ${state.activeConversationId === conv.id ? 'active' : ''}`}
                    onClick={() => handleSelectConversation(conv.id)}
                  >
                    <div className="conv-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                    </div>
                    <div className="conv-info">
                      {editingId === conv.id ? (
                        <input
                          ref={editInputRef}
                          className="rename-input"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onBlur={handleFinishRename}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleFinishRename(); if (e.key === 'Escape') setEditingId(null); }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <>
                          <span className="conv-title">{truncateText(conv.title, 30)}</span>
                          <span className="conv-meta">{conv.messages.length} msgs · {formatTimestamp(conv.updatedAt)}</span>
                        </>
                      )}
                    </div>
                    <div className="conv-actions">
                      <button className="conv-action-btn" onClick={(e) => handleStartRename(conv.id, conv.title, e)} title="Rename">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                      </button>
                      <button className="conv-action-btn delete" onClick={(e) => handleDeleteConversation(conv.id, e)} title="Delete">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
