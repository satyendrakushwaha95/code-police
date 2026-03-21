import { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { useConversations } from '../../store/ConversationContext';
import { useSettings } from '../../store/SettingsContext';
import { useWorkspace } from '../../store/WorkspaceContext';
import { ollamaService } from '../../services/ollama';
import { buildContextFromAttachments } from '../../services/fileReader';
import { calculateContextWindow } from '../../utils/contextWindow';
import type { Message, FileAttachment, OllamaChatMessage } from '../../types/chat';
import { v4 as uuidv4 } from 'uuid';
import MessageBubble from './MessageBubble';
import HeaderLogo from '../../header-logo.png';
import ChatInput from './ChatInput';
import SemanticSearchModal from './SemanticSearchModal';
import RefactorModal from './RefactorModal';
import { useToast } from '../../hooks/useToast';
import './Chat.css';

interface ChatViewProps {
  inputRef?: React.RefObject<{ focus: () => void } | null>;
  onCloseChat?: () => void;
  onOpenCodeGen?: () => void;
  onOpenRefactor?: () => void;
  onOpenPipelinePanel?: () => void;
  onOpenAgentPanel?: () => void;
  onOpenFilePanel?: () => void;
}

export interface ChatViewHandle {
  addFileContext: (content: string, fileName: string) => void;
}

const ChatView = forwardRef<ChatViewHandle, ChatViewProps>(function ChatView(
  { inputRef: _inputRef, onCloseChat, onOpenCodeGen, onOpenRefactor, onOpenPipelinePanel, onOpenAgentPanel, onOpenFilePanel },
  ref
) {
  const { state, dispatch, activeConversation } = useConversations();
  const { settings } = useSettings();
  const { showToast } = useToast();
  const { state: workspace } = useWorkspace();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activePipelineRef = useRef<{ convId: string; messageId: string } | null>(null);
  const pipelineMessageSentRef = useRef<boolean>(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const chatInputRef = useRef<{ focus: () => void }>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<FileAttachment[]>([]);
  const [showSemanticSearch, setShowSemanticSearch] = useState(false);
  const [refactorCode, setRefactorCode] = useState<{ code: string; filename: string } | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [showContextDetails, setShowContextDetails] = useState(false);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    addFileContext: (content: string, fileName: string) => {
      const att: FileAttachment = {
        id: uuidv4(),
        name: fileName,
        type: 'text/plain',
        content,
        size: content.length,
      };
      setPendingAttachments(prev => [...prev, att]);
    },
  }));

  // Expose focus to parent
  useImperativeHandle(_inputRef, () => ({
    focus: () => chatInputRef.current?.focus(),
  }));

  // Listen for newchat event from keyboard shortcuts
  useEffect(() => {
    const handler = () => {
      dispatch({ type: 'CREATE_CONVERSATION', payload: { model: settings.model } });
    };
    document.addEventListener('localmind:newchat', handler);
    return () => document.removeEventListener('localmind:newchat', handler);
  }, [dispatch, settings.model]);

  // Listen for semantic search event from keyboard shortcuts
  useEffect(() => {
    const handler = () => {
      setShowSemanticSearch(true);
    };
    document.addEventListener('localmind:semanticsearch', handler);
    return () => document.removeEventListener('localmind:semanticsearch', handler);
  }, []);

  // Listen for prompt enhancer insertion
  useEffect(() => {
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.prompt) {
        setPendingPrompt(customEvent.detail.prompt);
      }
    };
    document.addEventListener('localmind:insertPrompt', handler);
    return () => document.removeEventListener('localmind:insertPrompt', handler);
  }, []);

  // Listen for pipeline events to update message status
  useEffect(() => {
    const ipcRenderer = (window as any).ipcRenderer;
    if (!ipcRenderer) return;

    const handlePipelineComplete = (_event: any, data: { runId: string; verdict: string; finalOutput: any }) => {
      console.log('[ChatView] Pipeline complete event:', data);
      if (!activePipelineRef.current) return;
      
      dispatch({ type: 'UPDATE_MESSAGE', payload: { 
        conversationId: activePipelineRef.current.convId, 
        messageId: activePipelineRef.current.messageId, 
        content: `✅ Pipeline completed - Verdict: ${data.verdict}`,
        pipelineStatus: 'complete',
      }});
      activePipelineRef.current = null;
    };

    const handlePipelineError = (_event: any, data: { runId: string; error: string }) => {
      console.log('[ChatView] Pipeline error event:', data);
      if (!activePipelineRef.current) return;
      
      dispatch({ type: 'UPDATE_MESSAGE', payload: { 
        conversationId: activePipelineRef.current.convId, 
        messageId: activePipelineRef.current.messageId, 
        content: `❌ Pipeline failed: ${data.error}`,
        pipelineStatus: 'failed',
      }});
      activePipelineRef.current = null;
    };

    const handlePipelineCancelled = (_event: any, data: { runId: string }) => {
      console.log('[ChatView] Pipeline cancelled event:', data);
      if (!activePipelineRef.current) return;
      
      dispatch({ type: 'UPDATE_MESSAGE', payload: { 
        conversationId: activePipelineRef.current.convId, 
        messageId: activePipelineRef.current.messageId, 
        content: `⛔ Pipeline cancelled`,
        pipelineStatus: 'cancelled',
      }});
      activePipelineRef.current = null;
    };

    ipcRenderer.on('pipeline:complete', handlePipelineComplete);
    ipcRenderer.on('pipeline:error', handlePipelineError);
    ipcRenderer.on('pipeline:cancelled', handlePipelineCancelled);

    return () => {
      ipcRenderer.off('pipeline:complete', handlePipelineComplete);
      ipcRenderer.off('pipeline:error', handlePipelineError);
      ipcRenderer.off('pipeline:cancelled', handlePipelineCancelled);
    };
  }, [dispatch]);

  // Auto-send pending prompt when conversation is ready
  useEffect(() => {
    if (pendingPrompt && activeConversation && activeConversation.messages.length === 0) {
      const timer = setTimeout(() => {
        sendMessage(pendingPrompt, []);
        setPendingPrompt(null);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [pendingPrompt, activeConversation?.id]);

  // Close context details when clicking outside
  useEffect(() => {
    if (!showContextDetails) return;
    const handleClick = () => setShowContextDetails(false);
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClick);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClick);
    };
  }, [showContextDetails]);

  // Check connection on mount and settings change
  useEffect(() => {
    const check = async () => {
      ollamaService.setEndpoint(settings.endpoint);
      const ok = await ollamaService.checkConnection();
      setConnected(ok);
    };
    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, [settings.endpoint]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConversation?.messages]);

  // Calculate context window
  const contextInfo = activeConversation
    ? calculateContextWindow(
        activeConversation.messages,
        [...activeConversation.attachments, ...pendingAttachments],
        settings.systemPrompt,
        settings.contextLength
      )
    : null;

  const sendMessage = useCallback(async (content: string, attachments: FileAttachment[], runAsPipeline: boolean = false, agentId?: string) => {
    if (!activeConversation) {
      dispatch({ type: 'CREATE_CONVERSATION', payload: { model: settings.model } });
      const newConvId = state.conversations.length > 0 ? state.conversations[0]?.id : null;
      if (!newConvId) return;
    }

    const convId = activeConversation?.id || state.conversations[0]?.id;
    if (!convId) return;

    if (runAsPipeline) {
      console.log('[ChatView] Pipeline mode triggered', agentId ? `with agent ${agentId}` : '');
      
      if (!workspace.rootPath) {
        showToast('Please open a workspace folder first before using "Send to Agent". Click on the File Explorer icon in the sidebar to open a folder.', 'error');
        return;
      }

      const ipcRenderer = (window as any).ipcRenderer;
      if (!ipcRenderer) {
        showToast('IPC not available', 'error');
        return;
      }

      console.log('[ChatView] Adding user message to:', convId);
      dispatch({ type: 'ADD_MESSAGE', payload: { conversationId: convId, message: {
        id: uuidv4(),
        role: 'user',
        content,
        timestamp: Date.now(),
      }}});

      const pipelineMessageId = uuidv4();
      console.log('[ChatView] Adding pipeline status message:', pipelineMessageId);

      // Reset the flag for new pipeline
      pipelineMessageSentRef.current = false;

      // Immediately show the "Task moved to Pipeline" message
      dispatch({ type: 'ADD_MESSAGE', payload: { conversationId: convId, message: {
        id: pipelineMessageId,
        role: 'assistant',
        content: `Task moved to Pipeline${agentId ? ' with custom agent' : ''}`,
        timestamp: Date.now(),
        isPipeline: true,
        pipelineStatus: 'running',
        pipelineRunId: '',
      }}});
      activePipelineRef.current = { convId, messageId: pipelineMessageId };
      pipelineMessageSentRef.current = true;

      try {
        console.log('[ChatView] Calling pipeline:run IPC');
        const result = await ipcRenderer.invoke('pipeline:run', {
          task: content,
          options: {
            maxRetries: 2,
            timeoutMs: 10 * 60 * 1000,
            autoExecute: true,
          },
          projectRoot: workspace.rootPath,
          agentId,
        });
        console.log('[ChatView] Pipeline started:', result.runId);
        
        // Update the message with the actual runId
        dispatch({ type: 'UPDATE_MESSAGE', payload: { 
          conversationId: convId, 
          messageId: pipelineMessageId,
          pipelineRunId: result.runId,
        }});
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error('[ChatView] Pipeline error:', errorMsg);
        
        // Update the message to show error
        dispatch({ type: 'UPDATE_MESSAGE', payload: { 
          conversationId: convId, 
          messageId: pipelineMessageId,
          content: `Pipeline failed: ${errorMsg}`,
          pipelineStatus: 'failed',
        }});
        showToast(`Pipeline error: ${errorMsg}`, 'error');
      }
      return;
    }

    // Regular chat flow
    // Merge pending attachments from file panel
    const allNewAttachments = [...attachments, ...pendingAttachments];
    setPendingAttachments([]);

    if (allNewAttachments.length > 0) {
      dispatch({
        type: 'ADD_ATTACHMENTS',
        payload: { conversationId: convId, attachments: allNewAttachments }
      });
    }

    const userMessage: Message = {
      id: uuidv4(),
      role: 'user',
      content,
      timestamp: Date.now(),
      attachments: allNewAttachments.length > 0 ? allNewAttachments : undefined,
    };
    dispatch({ type: 'ADD_MESSAGE', payload: { conversationId: convId, message: userMessage } });

    const assistantMessage: Message = {
      id: uuidv4(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
    };
    dispatch({ type: 'ADD_MESSAGE', payload: { conversationId: convId, message: assistantMessage } });

    const conv = state.conversations.find(c => c.id === convId);
    const allMessages = conv ? [...conv.messages] : [];

    const ollamaMessages: OllamaChatMessage[] = [];

    if (settings.systemPrompt) {
      ollamaMessages.push({ role: 'system', content: settings.systemPrompt });
    }

    const allAttachments = [
      ...(conv?.attachments || []),
      ...allNewAttachments,
    ];
    let contextStr = '';
    if (allAttachments.length > 0) {
      contextStr = buildContextFromAttachments(allAttachments);
    }

    for (const msg of allMessages) {
      if (msg.role === 'system') continue;
      ollamaMessages.push({ role: msg.role, content: msg.content });
    }

    if (contextStr) {
      ollamaMessages.push({ 
        role: 'user', 
        content: `I have attached some files for context. Please use them to answer my request.\n\n[START OF CONTEXT FILES]\n${contextStr}\n[END OF CONTEXT FILES]\n\nMy request: ${content}` 
      });
    } else {
      ollamaMessages.push({ role: 'user', content });
    }

    setIsStreaming(true);
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    let model = settings.model;
    let usedFallback = false;
    try {
      const routing = await ollamaService.resolveModel(
        ollamaMessages,
        {
          temperature: settings.temperature,
          top_p: settings.topP,
          num_ctx: settings.contextLength,
        },
        'chat_general'
      );
      model = routing.resolvedModel;
      usedFallback = routing.usedFallback;
      if (usedFallback) {
        showToast(`Using fallback model: ${model}`, 'info');
      }
    } catch (err) {
      console.warn('Failed to resolve model, using default:', err);
    }

    try {
      ollamaService.setEndpoint(settings.endpoint);
      let fullContent = '';

      for await (const chunk of ollamaService.chatStream(
        model,
        ollamaMessages,
        {
          temperature: settings.temperature,
          top_p: settings.topP,
          num_ctx: settings.contextLength,
        },
        abortController.signal
      )) {
        if (chunk.message?.content) {
          fullContent += chunk.message.content;
          dispatch({
            type: 'UPDATE_MESSAGE',
            payload: {
              conversationId: convId,
              messageId: assistantMessage.id,
              content: fullContent,
              isStreaming: !chunk.done,
            },
          });
        }

        if (chunk.done) {
          dispatch({
            type: 'UPDATE_MESSAGE',
            payload: {
              conversationId: convId,
              messageId: assistantMessage.id,
              content: fullContent,
              isStreaming: false,
            },
          });
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        dispatch({
          type: 'UPDATE_MESSAGE',
          payload: {
            conversationId: convId,
            messageId: assistantMessage.id,
            content: (state.conversations.find(c => c.id === convId)?.messages.find(m => m.id === assistantMessage.id)?.content || '') + '\n\n*[Generation stopped]*',
            isStreaming: false,
          },
        });
      } else {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        dispatch({
          type: 'UPDATE_MESSAGE',
          payload: {
            conversationId: convId,
            messageId: assistantMessage.id,
            content: `⚠️ **Error**: ${errorMsg}\n\nMake sure Ollama is running at \`${settings.endpoint}\` with the \`${settings.model}\` model loaded.`,
            isStreaming: false,
          },
        });
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  }, [activeConversation, state.conversations, dispatch, settings, pendingAttachments]);

  const handleStop = () => {
    abortControllerRef.current?.abort();
  };

  const handleEditMessage = (messageId: string, newContent: string) => {
    if (!activeConversation) return;
    const msgIndex = activeConversation.messages.findIndex(m => m.id === messageId);
    if (msgIndex < 0) return;
    const messagesToDelete = activeConversation.messages.slice(msgIndex);
    for (const msg of messagesToDelete) {
      dispatch({
        type: 'DELETE_MESSAGE',
        payload: { conversationId: activeConversation.id, messageId: msg.id },
      });
    }
    sendMessage(newContent, []);
  };

  const handleRegenerate = (messageId: string) => {
    if (!activeConversation) return;
    const msgIndex = activeConversation.messages.findIndex(m => m.id === messageId);
    if (msgIndex < 1) return;
    const userMsg = activeConversation.messages[msgIndex - 1];
    if (userMsg.role !== 'user') return;
    dispatch({
      type: 'DELETE_MESSAGE',
      payload: { conversationId: activeConversation.id, messageId },
    });
    sendMessage(userMsg.content, []);
  };

  const handleDeleteMessage = (messageId: string) => {
    if (!activeConversation) return;
    dispatch({
      type: 'DELETE_MESSAGE',
      payload: { conversationId: activeConversation.id, messageId },
    });
  };

  const handleAddSemanticResults = (results: any[]) => {
    // Convert search results to file attachments
    const attachments: FileAttachment[] = results.map(result => ({
      id: uuidv4(),
      name: `${result.relativeFilePath}:${result.startLine}-${result.endLine}`,
      type: 'text/plain',
      content: `File: ${result.relativeFilePath} (lines ${result.startLine}-${result.endLine})\n\n${result.content}`,
      size: result.content.length,
    }));
    setPendingAttachments(prev => [...prev, ...attachments]);
  };

  // No active conversation – welcome screen
  if (!activeConversation) {
    const handleSearchSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      const form = e.target as HTMLFormElement;
      const textarea = form.querySelector('textarea') as HTMLTextAreaElement;
      const prompt = textarea.value.trim();
      if (prompt) {
        dispatch({ type: 'CREATE_CONVERSATION', payload: { model: settings.model } });
        setPendingPrompt(prompt);
        textarea.value = '';
      }
    };

    const handleLogoClick = () => {
      dispatch({ type: 'SET_ACTIVE', payload: null });
    };

    const quickActions = [
      { label: 'New Chat', icon: 'chat', action: () => dispatch({ type: 'CREATE_CONVERSATION', payload: { model: settings.model } }) },
      { label: 'Generate Code', icon: 'bolt', action: () => onOpenCodeGen?.() },
      { label: 'Refactor', icon: 'wrench', action: () => onOpenRefactor?.() },
      { label: 'Pipeline', icon: 'activity', action: () => onOpenPipelinePanel?.() },
      { label: 'Open Project', icon: 'folder', action: () => onOpenFilePanel?.() },
      { label: 'Agents', icon: 'brain', action: () => onOpenAgentPanel?.() },
    ];

    return (
      <div className="chat-view">
        <div className="dashboard">
          <svg className="dashboard-bg-mesh" viewBox="0 0 1000 1000" preserveAspectRatio="none">
            {/* Top-left geometric mesh - moved further left */}
            <g stroke="var(--bg-mesh-line)" strokeWidth="1" fill="none">
              <path d="M0 0 L200 0 L100 150 Z" />
              <path d="M100 150 L200 0 L250 200 Z" />
              <path d="M0 0 L100 150 L0 200 Z" />
            </g>

            {/* Top-right geometric mesh - moved further right */}
            <g stroke="var(--bg-mesh-line)" strokeWidth="1" fill="none">
              <path d="M800 0 L1000 80 L900 180 Z" />
              <path d="M900 180 L1000 80 L1000 250 Z" />
              <path d="M750 60 L800 0 L900 180 Z" />
            </g>

            {/* Bottom-left geometric mesh */}
            <g stroke="var(--bg-mesh-line)" strokeWidth="1" fill="none">
              <path d="M0 800 L200 750 L100 950 Z" />
              <path d="M100 950 L200 750 L250 900 Z" />
              <path d="M0 800 L100 950 L0 1000 Z" />
            </g>

            {/* Bottom-right geometric mesh */}
            <g stroke="var(--bg-mesh-line)" strokeWidth="1" fill="none">
              <path d="M800 800 L1000 850 L900 1000 Z" />
              <path d="M900 1000 L1000 850 L1000 1000 Z" />
              <path d="M750 850 L800 800 L900 1000 Z" />
            </g>

            {/* Left-side circuit lines */}
            <g stroke="var(--bg-mesh-line)" strokeWidth="1.5" fill="none">
              <path d="M30 300 H150" />
              <circle cx="30" cy="300" r="3" fill="var(--bg-mesh-line)" />

              <path d="M20 500 H140" />
              <circle cx="20" cy="500" r="3" fill="var(--bg-mesh-line)" />

              <path d="M40 700 H160" />
              <circle cx="40" cy="700" r="3" fill="var(--bg-mesh-line)" />
            </g>

            {/* Right-side circuit lines */}
            <g stroke="var(--bg-mesh-line)" strokeWidth="1.5" fill="none">
              <path d="M850 300 H970" />
              <circle cx="970" cy="300" r="3" fill="var(--bg-mesh-line)" />

              <path d="M860 500 H980" />
              <circle cx="980" cy="500" r="3" fill="var(--bg-mesh-line)" />

              <path d="M840 700 H960" />
              <circle cx="960" cy="700" r="3" fill="var(--bg-mesh-line)" />
            </g>

            {/* Arrow accents - positioned at edges */}
            <g fill="var(--bg-mesh-accent)">
              <polygon points="120,400 140,410 120,420" />
              <polygon points="860,250 880,260 860,270" />
              <polygon points="80,800 100,810 80,820" />
            </g>

            {/* Small dots pattern - at edges only */}
            <g fill="var(--bg-mesh-line)">
              <circle cx="80" cy="100" r="2" />
              <circle cx="50" cy="400" r="2" />
              <circle cx="100" cy="600" r="2" />
              <circle cx="920" cy="150" r="2" />
              <circle cx="950" cy="400" r="2" />
              <circle cx="900" cy="600" r="2" />
            </g>
          </svg>

          <div className="dashboard-content">
            <div className="dashboard-logo" onClick={handleLogoClick}>
            <img src={HeaderLogo} alt="LocalMind AI" className="dashboard-logo-img" />
          </div>

          <form className="dashboard-search" onSubmit={handleSearchSubmit}>
            <textarea
              className="search-input"
              placeholder="Ask anything..."
              rows={3}
              autoFocus
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = '80px';
                target.style.height = `${target.scrollHeight}px`;
              }}
            />
            <button type="submit" className="search-send-btn" title="Send">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </form>

          <div className="quick-actions-grid">
            {quickActions.map((item, idx) => (
              <button key={idx} className="quick-action-card" onClick={item.action}>
                <div className={`quick-action-icon icon-${item.icon}`}>
                  {item.icon === 'chat' && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                    </svg>
                  )}
                  {item.icon === 'bolt' && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                    </svg>
                  )}
                  {item.icon === 'wrench' && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
                    </svg>
                  )}
                  {item.icon === 'activity' && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                    </svg>
                  )}
                  {item.icon === 'folder' && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
                    </svg>
                  )}
                  {item.icon === 'brain' && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="3"/><path d="M12 2v4m0 12v4m10-10h-4M6 12H2m15.07-5.07l-2.83 2.83M9.76 14.24l-2.83 2.83m11.14 0l-2.83-2.83M9.76 9.76L6.93 6.93"/>
                    </svg>
                  )}
                </div>
                <span className="quick-action-label">{item.label}</span>
              </button>
            ))}
          </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-view-wrapper">
      <div className="chat-view">
        <div className="chat-header">
          <div className="chat-header-info">
            <button
              className="btn-icon home-btn"
              onClick={() => dispatch({ type: 'SET_ACTIVE', payload: null })}
              title="Back to Dashboard"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
            </button>
            <h2>{activeConversation.title}</h2>
            {activeConversation.attachments.length > 0 && (
              <span className="attachment-badge" title={`${activeConversation.attachments.length} file(s) attached`}>
                📎 {activeConversation.attachments.length}
              </span>
            )}
            {contextInfo && (
              <span 
                className={`context-badge context-badge-${contextInfo.level}`}
                onClick={() => setShowContextDetails(!showContextDetails)}
              >
                <span className="context-badge-dot"></span>
                {(contextInfo.totalTokens / 1000).toFixed(1)}K / {(contextInfo.maxTokens / 1000).toFixed(0)}K
              </span>
            )}
          </div>
          <div className="chat-header-actions">
            <button
              className="btn-icon"
              onClick={() => setShowSemanticSearch(true)}
              title="Semantic Code Search (Ctrl+Shift+F)"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/>
                <path d="m21 21-4.35-4.35"/>
              </svg>
            </button>
            {onCloseChat && (
              <button
                className="btn-icon"
                onClick={onCloseChat}
                title="Close Chat"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            )}
          </div>
        </div>

        <div className="messages-area">
          {activeConversation.messages.length === 0 && (
            <div className="empty-chat">
              <p className="empty-hint">Type a message to start the conversation</p>
            </div>
          )}
          {activeConversation.messages.map(msg => (
            <MessageBubble
              key={msg.id}
              role={msg.role as 'user' | 'assistant' | 'system'}
              content={msg.content}
              isStreaming={msg.isStreaming}
              timestamp={msg.timestamp}
              isPipeline={msg.isPipeline}
              pipelineStatus={msg.pipelineStatus}
              pipelineRunId={msg.pipelineRunId}
              onEdit={msg.role === 'user' ? (newContent) => handleEditMessage(msg.id, newContent) : undefined}
              onRegenerate={msg.role === 'assistant' ? () => handleRegenerate(msg.id) : undefined}
              onDelete={() => handleDeleteMessage(msg.id)}
            />
          ))}
          <div ref={messagesEndRef} />
        </div>

        {pendingAttachments.length > 0 && (
          <div className="pending-context-bar">
            <span className="pending-label">📎 Context files:</span>
            {pendingAttachments.map(att => (
              <div key={att.id} className="file-chip">
                <span className="file-name">{att.name}</span>
                <button className="remove-btn" onClick={() => setPendingAttachments(prev => prev.filter(a => a.id !== att.id))}>×</button>
              </div>
            ))}
          </div>
        )}

        <div className="chat-input-wrapper">
          {contextInfo && (
            <div className={`context-expanded ${showContextDetails ? 'visible' : ''}`}>
              <div className="context-expanded-title">Context Window</div>
              <div className="context-expanded-bar">
                <div 
                  className={`context-expanded-fill ${contextInfo.level}`}
                  style={{ width: `${Math.min(contextInfo.usagePercent, 100)}%` }}
                />
              </div>
              <div className="context-expanded-stats">
                <span className="context-expanded-used">{(contextInfo.totalTokens / 1000).toFixed(1)}K used</span>
                <span className="context-expanded-total">/ {(contextInfo.maxTokens / 1000).toFixed(0)}K total</span>
              </div>
            </div>
          )}
          <ChatInput
            ref={chatInputRef}
            onSend={sendMessage}
            onStop={handleStop}
            isStreaming={isStreaming}
            disabled={!connected}
            connected={connected}
            initialValue={pendingPrompt || undefined}
          />
        </div>
      </div>

      {showSemanticSearch && (
        <SemanticSearchModal
          onClose={() => setShowSemanticSearch(false)}
          onAddResults={handleAddSemanticResults}
        />
      )}

      {refactorCode && (
        <RefactorModal
          code={refactorCode.code}
          filename={refactorCode.filename}
          onApply={(newCode) => {
            const event = new CustomEvent('localmind:applyRefactor', { detail: { newCode, filename: refactorCode.filename } });
            document.dispatchEvent(event);
            setRefactorCode(null);
          }}
          onClose={() => setRefactorCode(null)}
        />
      )}
    </div>
  );
});

export default ChatView;
