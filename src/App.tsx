import { useState, useRef, useEffect } from 'react';
import { ConversationProvider, useConversations } from './store/ConversationContext';
import { SettingsProvider, useSettings } from './store/SettingsContext';
import { ScanProvider } from './store/ScanContext';
import Sidebar from './components/Sidebar/Sidebar';
import ChatView from './components/Chat/ChatView';
import SettingsModal from './components/Settings/SettingsModal';
import UsageDashboard from './components/Usage/UsageDashboard';
import CommandPalette from './components/CommandPalette/CommandPalette';
import ScanDashboard from './components/ScanDashboard/ScanDashboard';
import FindingsExplorer from './components/Findings/FindingsExplorer';
import ReportView from './components/Report/ReportView';
import ScanHistory from './components/ScanHistory/ScanHistory';
import { useKeyboardShortcuts, SHORTCUTS_LIST } from './hooks/useKeyboardShortcuts';
import { useToast, ToastContainer } from './hooks/useToast';

type MainTab = 'dashboard' | 'findings' | 'report' | 'history' | 'chat';

function AppContent() {
  const { state: convState, dispatch } = useConversations();
  const { settings } = useSettings();
  const [showSettings, setShowSettings] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showUsage, setShowUsage] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [activeTab, setActiveTab] = useState<MainTab>('dashboard');
  const chatInputRef = useRef<{ focus: () => void }>(null);
  const chatViewRef = useRef<{ addFileContext: (content: string, fileName: string) => void }>(null);
  const { toasts, showToast, dismissToast } = useToast();

  useKeyboardShortcuts({
    onNewChat: () => {
      document.dispatchEvent(new CustomEvent('codepolice:newchat'));
      setActiveTab('chat');
    },
    onToggleSidebar: () => setSidebarCollapsed(prev => !prev),
    onToggleFilePanel: () => {},
    onOpenSettings: () => setShowSettings(true),
    onFocusInput: () => { setActiveTab('chat'); chatInputRef.current?.focus(); },
    onShowShortcuts: () => setShowShortcuts(prev => !prev),
    onSemanticSearch: () => {
      document.dispatchEvent(new CustomEvent('codepolice:semanticsearch'));
    },
    onToggleTerminal: () => {},
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setShowCommandPalette(prev => !prev);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const ipc = (window as any).ipcRenderer;
    if (!ipc) return;
    const handler = () => setShowCommandPalette(true);
    ipc.on('jarvis:summon', handler);
    return () => ipc.off('jarvis:summon', handler);
  }, []);

  useEffect(() => {
    const handlers: Record<string, () => void> = {
      'codepolice:openSettings': () => setShowSettings(true),
      'codepolice:openUsage': () => setShowUsage(true),
    };
    const entries = Object.entries(handlers);
    entries.forEach(([event, handler]) => document.addEventListener(event, handler));
    return () => entries.forEach(([event, handler]) => document.removeEventListener(event, handler));
  }, []);

  useEffect(() => {
    const ipc = (window as any).ipcRenderer;
    if (!ipc) return;
    const onComplete = (_: any, data: { scanId: string; summary: any }) => {
      const s = data.summary;
      const msg = s
        ? `Scan complete: ${s.totalFindings} findings (${s.criticalCount} critical, ${s.highCount} high). Health: ${s.healthScore ?? '?'}/100`
        : 'Scan complete';
      showToast(msg, s?.criticalCount > 0 ? 'error' : 'success');
      setActiveTab('findings');
    };
    const onError = (_: any, data: { scanId: string; error: string }) => {
      showToast(`Scan failed: ${data.error}`, 'error');
    };
    ipc.on('scan:complete', onComplete);
    ipc.on('scan:error', onError);
    return () => {
      ipc.off('scan:complete', onComplete);
      ipc.off('scan:error', onError);
    };
  }, [showToast]);

  const tabConfig = [
    { id: 'dashboard' as MainTab, label: 'Dashboard', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg> },
    { id: 'findings' as MainTab, label: 'Findings', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> },
    { id: 'report' as MainTab, label: 'Report', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> },
    { id: 'history' as MainTab, label: 'History', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
    { id: 'chat' as MainTab, label: 'Chat', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg> },
  ];

  return (
    <>
      <div className="app-layout">
        <Sidebar
          onOpenSettings={() => setShowSettings(true)}
          isCollapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          onOpenChat={() => setActiveTab('chat')}
          onOpenUsage={() => setShowUsage(true)}
          onOpenDashboard={() => setActiveTab('dashboard')}
          onOpenFindings={() => setActiveTab('findings')}
          onOpenReport={() => setActiveTab('report')}
          onOpenHistory={() => setActiveTab('history')}
        />
        
        <div className="main-content">
          <div className="main-tab-bar">
            <div className="main-tab-bar-tabs">
              {tabConfig.map(tab => (
                <button
                  key={tab.id}
                  className={`main-tab ${activeTab === tab.id ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <span className="main-tab-icon">{tab.icon}</span>
                  <span className="main-tab-label">{tab.label}</span>
                </button>
              ))}
            </div>
            <div className="win-controls">
              <button className="win-btn win-minimize" onClick={() => (window as any).ipcRenderer?.send('window:minimize')} title="Minimize">
                <svg width="10" height="1" viewBox="0 0 10 1"><rect width="10" height="1" fill="currentColor"/></svg>
              </button>
              <button className="win-btn win-maximize" onClick={() => (window as any).ipcRenderer?.send('window:maximize')} title="Maximize">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1"><rect x="0.5" y="0.5" width="9" height="9"/></svg>
              </button>
              <button className="win-btn win-close" onClick={() => (window as any).ipcRenderer?.send('window:close')} title="Close">
                <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.2"><line x1="0" y1="0" x2="10" y2="10"/><line x1="10" y1="0" x2="0" y2="10"/></svg>
              </button>
            </div>
          </div>

          <div className="main-tab-content">
            {activeTab === 'dashboard' && <ScanDashboard />}
            {activeTab === 'findings' && <FindingsExplorer />}
            {activeTab === 'report' && <ReportView />}
            {activeTab === 'history' && <ScanHistory onSelectScan={() => setActiveTab('findings')} />}
            {activeTab === 'chat' && (
              <ChatView
                ref={chatViewRef}
                inputRef={chatInputRef}
                onCloseChat={() => setActiveTab('dashboard')}
              />
            )}
          </div>
        </div>
      </div>

      {showUsage && (
        <UsageDashboard onClose={() => setShowUsage(false)} />
      )}

      {showCommandPalette && (
        <CommandPalette
          onClose={() => setShowCommandPalette(false)}
          onAction={(action, payload) => {
            setShowCommandPalette(false);
            switch (action) {
              case 'new_chat': dispatch({ type: 'CREATE_CONVERSATION', payload: { model: settings.model } }); setActiveTab('chat'); break;
              case 'scan': setActiveTab('dashboard'); break;
              case 'findings': setActiveTab('findings'); break;
              case 'report': setActiveTab('report'); break;
              case 'onboard': {
                document.dispatchEvent(new CustomEvent('codepolice:onboard'));
                break;
              }
              case 'usage': setShowUsage(true); break;
              case 'settings': setShowSettings(true); break;
              case 'shortcuts': setShowShortcuts(true); break;
              case 'switch_conversation':
                if (payload) {
                  dispatch({ type: 'SET_ACTIVE', payload });
                  setActiveTab('chat');
                }
                break;
            }
          }}
        />
      )}

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}

      {showShortcuts && (
        <div className="shortcuts-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowShortcuts(false); }}>
          <div className="shortcuts-content">
            <h2>Keyboard Shortcuts</h2>
            {SHORTCUTS_LIST.map(group => (
              <div key={group.group} className="shortcut-group">
                <h3>{group.group}</h3>
                {group.items.map(item => (
                  <div key={item.desc} className="shortcut-item">
                    <span className="shortcut-desc">{item.desc}</span>
                    <div className="shortcut-keys">
                      {item.keys.map(k => <span key={k} className="key">{k}</span>)}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}

import { WorkspaceProvider } from './store/WorkspaceContext';

export default function App() {
  return (
    <SettingsProvider>
      <ConversationProvider>
        <WorkspaceProvider>
          <ScanProvider>
            <AppContent />
          </ScanProvider>
        </WorkspaceProvider>
      </ConversationProvider>
    </SettingsProvider>
  );
}
