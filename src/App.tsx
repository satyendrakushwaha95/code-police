import { useState, useCallback, useRef, useEffect } from 'react';
import { ConversationProvider, useConversations } from './store/ConversationContext';
import { SettingsProvider, useSettings } from './store/SettingsContext';
import { AgentProvider } from './store/AgentContext';
import Sidebar from './components/Sidebar/Sidebar';
import ChatView from './components/Chat/ChatView';
import SettingsModal from './components/Settings/SettingsModal';
import RoutingSettingsPanel from './components/Settings/RoutingSettingsPanel';
import PipelinePanel from './components/Pipeline/PipelinePanel';
import FilePanel from './components/FilePanel/FilePanel';
import TerminalPanel from './components/Terminal/TerminalPanel';
import CodeGenPanel from './components/Chat/CodeGenPanel';
import RefactorPanel from './components/Chat/RefactorPanel';
import DesignDocPanel from './components/Chat/DesignDocPanel';
import PromptEnhancerPanel from './components/Chat/PromptEnhancerPanel';
import AgentPanel from './components/Agent/AgentPanel';
import ComparePanel from './components/Compare/ComparePanel';
import UsageDashboard from './components/Usage/UsageDashboard';
import CommandPalette from './components/CommandPalette/CommandPalette';
import { useKeyboardShortcuts, SHORTCUTS_LIST } from './hooks/useKeyboardShortcuts';
import { useToast, ToastContainer } from './hooks/useToast';
import { useCompare } from './hooks/useCompare';
import './components/SidePanel/SidePanel.css';

function AppContent() {
  const { state: convState, dispatch } = useConversations();
  const { settings } = useSettings();
  const [showSettings, setShowSettings] = useState(false);
  const [showRoutingSettings, setShowRoutingSettings] = useState(false);
  const [showPipelinePanel, setShowPipelinePanel] = useState(false);
  const [showAgentPanel, setShowAgentPanel] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [filePanelOpen, setFilePanelOpen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [showCodeGen, setShowCodeGen] = useState(false);
  const [showRefactor, setShowRefactor] = useState(false);
  const [showDesignDoc, setShowDesignDoc] = useState(false);
  const [showPromptEnhancer, setShowPromptEnhancer] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [showUsage, setShowUsage] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [comparePrompt, setComparePrompt] = useState('');
  const [chatVisible, setChatVisible] = useState(true);
  const chatInputRef = useRef<{ focus: () => void }>(null);
  const chatViewRef = useRef<{ addFileContext: (content: string, fileName: string) => void }>(null);
  const { toasts, showToast, dismissToast } = useToast();
  const compare = useCompare();

  const handleAddContext = useCallback((content: string, fileName: string) => {
    chatViewRef.current?.addFileContext(content, fileName);
    showToast(`Added "${fileName}" as context`, 'success');
  }, [showToast]);

  useKeyboardShortcuts({
    onNewChat: () => {
      document.dispatchEvent(new CustomEvent('localmind:newchat'));
    },
    onToggleSidebar: () => setSidebarCollapsed(prev => !prev),
    onToggleFilePanel: () => setFilePanelOpen(prev => !prev),
    onOpenSettings: () => setShowSettings(true),
    onFocusInput: () => chatInputRef.current?.focus(),
    onShowShortcuts: () => setShowShortcuts(prev => !prev),
    onSemanticSearch: () => {
      document.dispatchEvent(new CustomEvent('localmind:semanticsearch'));
    },
    onToggleTerminal: () => setShowTerminal(prev => !prev),
  });

  // Ctrl+K command palette
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

  // Jarvis: global hotkey summon (Ctrl+Space from system tray)
  useEffect(() => {
    const ipc = (window as any).ipcRenderer;
    if (!ipc) return;
    const handler = () => setShowCommandPalette(true);
    ipc.on('jarvis:summon', handler);
    return () => ipc.off('jarvis:summon', handler);
  }, []);

  // Command router events — panels that ChatView can't open directly
  useEffect(() => {
    const handlers: Record<string, () => void> = {
      'localmind:openDesignDoc': () => setShowDesignDoc(true),
      'localmind:openSettings': () => setShowSettings(true),
      'localmind:openTerminal': () => setShowTerminal(true),
      'localmind:openUsage': () => setShowUsage(true),
    };
    const entries = Object.entries(handlers);
    entries.forEach(([event, handler]) => document.addEventListener(event, handler));
    return () => entries.forEach(([event, handler]) => document.removeEventListener(event, handler));
  }, []);

  return (
    <>
      <div className="app-layout">
        <Sidebar
          onOpenSettings={() => setShowSettings(true)}
          onOpenPipelinePanel={() => setShowPipelinePanel(true)}
          onOpenAgentPanel={() => setShowAgentPanel(true)}
          isCollapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          onOpenCodeGen={() => setShowCodeGen(true)}
          onOpenRefactor={() => setShowRefactor(true)}
          onOpenDesignDoc={() => setShowDesignDoc(true)}
          onOpenPromptEnhancer={() => setShowPromptEnhancer(true)}
          onToggleFilePanel={() => setFilePanelOpen(!filePanelOpen)}
          onToggleTerminal={() => setShowTerminal(!showTerminal)}
          onOpenChat={() => setChatVisible(true)}
          onOpenUsage={() => setShowUsage(true)}
        />
        
        <div className={`main-content ${!chatVisible ? 'chat-closed' : ''}`}>
          {chatVisible && (
            <ChatView
              ref={chatViewRef}
              inputRef={chatInputRef}
              onCloseChat={() => setChatVisible(false)}
              onOpenCodeGen={() => setShowCodeGen(true)}
              onOpenRefactor={() => setShowRefactor(true)}
              onOpenPipelinePanel={() => setShowPipelinePanel(true)}
              onOpenAgentPanel={() => setShowAgentPanel(true)}
              onOpenFilePanel={() => setFilePanelOpen(true)}
              onOpenCompare={(prompt) => {
                setComparePrompt(prompt || '');
                setShowCompare(true);
              }}
            />
          )}
          
          {showPipelinePanel && (
            <PipelinePanel onClose={() => setShowPipelinePanel(false)} />
          )}
        </div>

        {showCodeGen && (
          <CodeGenPanel 
            onClose={() => setShowCodeGen(false)}
            onInsertCode={(code: string, filename: string) => {
              const event = new CustomEvent('localmind:insertCode', { detail: { code, filename } });
              document.dispatchEvent(event);
            }}
          />
        )}
        {showRefactor && (
          <RefactorPanel onClose={() => setShowRefactor(false)} />
        )}
        {showDesignDoc && (
          <DesignDocPanel onClose={() => setShowDesignDoc(false)} />
        )}
        {showPromptEnhancer && (
          <PromptEnhancerPanel 
            onClose={() => setShowPromptEnhancer(false)}
            onInsertToChat={(prompt) => {
              const event = new CustomEvent('localmind:insertPrompt', { detail: { prompt } });
              document.dispatchEvent(event);
            }}
          />
        )}
        {filePanelOpen && (
          <FilePanel
            isOpen={filePanelOpen}
            onClose={() => setFilePanelOpen(false)}
            onAddContext={handleAddContext}
          />
        )}
        {showTerminal && (
          <TerminalPanel onClose={() => setShowTerminal(false)} />
        )}
      </div>

      {showAgentPanel && (
        <AgentPanel onClose={() => setShowAgentPanel(false)} />
      )}

      {showUsage && (
        <UsageDashboard onClose={() => setShowUsage(false)} />
      )}

      {showCompare && (
        <ComparePanel
          session={compare.session}
          onStart={(prompt, models, systemPrompt, options) => {
            compare.startComparison(prompt, models, systemPrompt, options);
          }}
          onAbort={compare.abortComparison}
          onSelect={compare.selectResponse}
          onRate={compare.rateResponse}
          onUseResponse={(content) => {
            showToast('Response adopted into chat', 'success');
            compare.closeSession();
            setShowCompare(false);
          }}
          onClose={() => {
            compare.closeSession();
            setShowCompare(false);
          }}
          initialPrompt={comparePrompt}
        />
      )}

      {showCommandPalette && (
        <CommandPalette
          onClose={() => setShowCommandPalette(false)}
          onAction={(action, payload) => {
            setShowCommandPalette(false);
            switch (action) {
              case 'new_chat': dispatch({ type: 'CREATE_CONVERSATION', payload: { model: settings.model } }); setChatVisible(true); break;
              case 'codegen': setShowCodeGen(true); break;
              case 'refactor': setShowRefactor(true); break;
              case 'designdoc': setShowDesignDoc(true); break;
              case 'pipeline': setShowPipelinePanel(true); break;
              case 'compare': setShowCompare(true); break;
              case 'files': setFilePanelOpen(true); break;
              case 'terminal': setShowTerminal(true); break;
              case 'agents': setShowAgentPanel(true); break;
              case 'onboard': {
                document.dispatchEvent(new CustomEvent('localmind:onboard'));
                break;
              }
              case 'usage': setShowUsage(true); break;
              case 'settings': setShowSettings(true); break;
              case 'shortcuts': setShowShortcuts(true); break;
              case 'switch_conversation':
                if (payload) {
                  dispatch({ type: 'SET_ACTIVE', payload });
                  setChatVisible(true);
                }
                break;
            }
          }}
        />
      )}

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}

      {showRoutingSettings && (
        <div className="routing-panel-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowRoutingSettings(false); }}>
          <div className="routing-panel">
            <RoutingSettingsPanel onClose={() => setShowRoutingSettings(false)} />
          </div>
        </div>
      )}

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
      <AgentProvider>
        <ConversationProvider>
          <WorkspaceProvider>
            <AppContent />
          </WorkspaceProvider>
        </ConversationProvider>
      </AgentProvider>
    </SettingsProvider>
  );
}
