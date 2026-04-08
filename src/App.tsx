import { useState, useCallback, useRef, useEffect } from 'react';
import { ConversationProvider, useConversations } from './store/ConversationContext';
import { SettingsProvider, useSettings } from './store/SettingsContext';
import { ScanProvider } from './store/ScanContext';
import Sidebar from './components/Sidebar/Sidebar';
import ChatView from './components/Chat/ChatView';
import SettingsModal from './components/Settings/SettingsModal';
import FilePanel from './components/FilePanel/FilePanel';
import UsageDashboard from './components/Usage/UsageDashboard';
import CommandPalette from './components/CommandPalette/CommandPalette';
import ScanDashboard from './components/ScanDashboard/ScanDashboard';
import FindingsExplorer from './components/Findings/FindingsExplorer';
import ReportView from './components/Report/ReportView';
import ScanHistory from './components/ScanHistory/ScanHistory';
import { useKeyboardShortcuts, SHORTCUTS_LIST } from './hooks/useKeyboardShortcuts';
import { useToast, ToastContainer } from './hooks/useToast';
import './components/SidePanel/SidePanel.css';

type MainTab = 'dashboard' | 'findings' | 'report' | 'chat';

function AppContent() {
  const { state: convState, dispatch } = useConversations();
  const { settings } = useSettings();
  const [showSettings, setShowSettings] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [filePanelOpen, setFilePanelOpen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showUsage, setShowUsage] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [activeTab, setActiveTab] = useState<MainTab>('dashboard');
  const chatInputRef = useRef<{ focus: () => void }>(null);
  const chatViewRef = useRef<{ addFileContext: (content: string, fileName: string) => void }>(null);
  const { toasts, showToast, dismissToast } = useToast();

  const handleAddContext = useCallback((content: string, fileName: string) => {
    chatViewRef.current?.addFileContext(content, fileName);
    showToast(`Added "${fileName}" as context`, 'success');
  }, [showToast]);

  useKeyboardShortcuts({
    onNewChat: () => {
      document.dispatchEvent(new CustomEvent('codepolice:newchat'));
      setActiveTab('chat');
    },
    onToggleSidebar: () => setSidebarCollapsed(prev => !prev),
    onToggleFilePanel: () => setFilePanelOpen(prev => !prev),
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
    { id: 'chat' as MainTab, label: 'Chat', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg> },
  ];

  return (
    <>
      <div className="app-layout">
        <Sidebar
          onOpenSettings={() => setShowSettings(true)}
          isCollapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          onToggleFilePanel={() => setFilePanelOpen(!filePanelOpen)}
          onOpenChat={() => setActiveTab('chat')}
          onOpenUsage={() => setShowUsage(true)}
          onOpenDashboard={() => setActiveTab('dashboard')}
          onOpenFindings={() => setActiveTab('findings')}
          onOpenReport={() => setActiveTab('report')}
          onOpenHistory={() => setShowHistory(!showHistory)}
        />
        
        <div className="main-content">
          <div className="main-tab-bar">
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

          <div className="main-tab-content">
            {activeTab === 'dashboard' && <ScanDashboard />}
            {activeTab === 'findings' && <FindingsExplorer />}
            {activeTab === 'report' && <ReportView />}
            {activeTab === 'chat' && (
              <ChatView
                ref={chatViewRef}
                inputRef={chatInputRef}
                onCloseChat={() => setActiveTab('dashboard')}
                onOpenFilePanel={() => setFilePanelOpen(true)}
              />
            )}
          </div>
        </div>

        {showHistory && (
          <div className="history-side-panel">
            <div className="history-side-panel-header">
              <h3>Scan History</h3>
              <button className="btn-icon" onClick={() => setShowHistory(false)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <ScanHistory onSelectScan={(scanId) => { setActiveTab('findings'); setShowHistory(false); }} />
          </div>
        )}

        {filePanelOpen && (
          <FilePanel
            isOpen={filePanelOpen}
            onClose={() => setFilePanelOpen(false)}
            onAddContext={handleAddContext}
          />
        )}
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
              case 'files': setFilePanelOpen(true); break;
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
