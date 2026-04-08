import { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { useConversations } from '../../store/ConversationContext';
import { useSettings } from '../../store/SettingsContext';
import { useWorkspace } from '../../store/WorkspaceContext';

import { ollamaService } from '../../services/ollama';
import { buildContextFromAttachments } from '../../services/fileReader';
import { calculateContextWindow } from '../../utils/contextWindow';
import { routeCommand } from '../../services/command-router';
import type { Message, FileAttachment, OllamaChatMessage } from '../../types/chat';
import { v4 as uuidv4 } from 'uuid';
import MessageBubble from './MessageBubble';
import HeaderLogo from '../../header-logo.png';
import ChatInput from './ChatInput';
import SemanticSearchModal from './SemanticSearchModal';

import { useToast } from '../../hooks/useToast';
import './Chat.css';

interface ChatViewProps {
  inputRef?: React.RefObject<{ focus: () => void } | null>;
  onCloseChat?: () => void;
  onOpenFilePanel?: () => void;
}

export interface ChatViewHandle {
  addFileContext: (content: string, fileName: string) => void;
}

const ChatView = forwardRef<ChatViewHandle, ChatViewProps>(function ChatView(
  { inputRef: _inputRef, onCloseChat, onOpenFilePanel },
  ref
) {
  const { state, dispatch, activeConversation } = useConversations();
  const { settings } = useSettings();
  const { showToast } = useToast();
  const { state: workspace } = useWorkspace();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const chatInputRef = useRef<{ focus: () => void }>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [activeModelOverride, setActiveModelOverride] = useState<{ providerId: string; model: string } | null>(null);
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
    document.addEventListener('codepolice:newchat', handler);
    return () => document.removeEventListener('codepolice:newchat', handler);
  }, [dispatch, settings.model]);

  // Listen for semantic search event from keyboard shortcuts
  useEffect(() => {
    const handler = () => {
      setShowSemanticSearch(true);
    };
    document.addEventListener('codepolice:semanticsearch', handler);
    return () => document.removeEventListener('codepolice:semanticsearch', handler);
  }, []);

  // Listen for prompt enhancer insertion
  useEffect(() => {
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.prompt) {
        setPendingPrompt(customEvent.detail.prompt);
      }
    };
    document.addEventListener('codepolice:insertPrompt', handler);
    return () => document.removeEventListener('codepolice:insertPrompt', handler);
  }, []);

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

  const sendMessage = useCallback(async (content: string, attachments: FileAttachment[]) => {
    if (!activeConversation) {
      dispatch({ type: 'CREATE_CONVERSATION', payload: { model: settings.model } });
      const newConvId = state.conversations.length > 0 ? state.conversations[0]?.id : null;
      if (!newConvId) return;
    }

    const convId = activeConversation?.id || state.conversations[0]?.id;
    if (!convId) return;

    // ── Jarvis: Command Router ──────────────────────────────────────────
    if (attachments.length === 0) {
      const cmdResult = await routeCommand(content, workspace.rootPath || undefined);

      if (cmdResult.intent !== 'none' && cmdResult.executed) {
        // Handle onboard command specially — needs async IPC + streaming display
        if (cmdResult.uiAction === 'onboard') {
          if (!workspace.rootPath) {
            showToast('Open a project folder first to use onboarding', 'error');
            return;
          }
          dispatch({ type: 'ADD_MESSAGE', payload: { conversationId: convId, message: {
            id: uuidv4(), role: 'user', content, timestamp: Date.now(),
          }}});
          const loadingMsgId = uuidv4();
          dispatch({ type: 'ADD_MESSAGE', payload: { conversationId: convId, message: {
            id: loadingMsgId, role: 'assistant', content: '🔍 Scanning project files and generating onboarding report...', timestamp: Date.now(), isStreaming: true,
          }}});

          try {
            const ipc = (window as any).ipcRenderer;
            const result = await ipc.invoke('project:onboard', { rootPath: workspace.rootPath });
            dispatch({ type: 'UPDATE_MESSAGE', payload: {
              conversationId: convId, messageId: loadingMsgId,
              content: result.formatted, isStreaming: false,
            }});
          } catch (err: any) {
            dispatch({ type: 'UPDATE_MESSAGE', payload: {
              conversationId: convId, messageId: loadingMsgId,
              content: `❌ Onboarding failed: ${err.message}`, isStreaming: false,
            }});
          }
          return;
        }

        // Handle UI panel openers
        if (cmdResult.uiAction) {
          const actionMap: Record<string, () => void> = {
            designdoc: () => document.dispatchEvent(new CustomEvent('codepolice:openDesignDoc')),
            settings: () => document.dispatchEvent(new CustomEvent('codepolice:openSettings')),
            files: () => onOpenFilePanel?.(),
            terminal: () => document.dispatchEvent(new CustomEvent('codepolice:openTerminal')),
            usage: () => document.dispatchEvent(new CustomEvent('codepolice:openUsage')),
            new_chat: () => dispatch({ type: 'CREATE_CONVERSATION', payload: { model: settings.model } }),
          };
          const action = actionMap[cmdResult.uiAction];
          if (action) action();
          return;
        }

        // Show command + result inline in chat
        dispatch({ type: 'ADD_MESSAGE', payload: { conversationId: convId, message: {
          id: uuidv4(),
          role: 'user',
          content,
          timestamp: Date.now(),
        }}});

        dispatch({ type: 'ADD_MESSAGE', payload: { conversationId: convId, message: {
          id: uuidv4(),
          role: 'assistant',
          content: cmdResult.displayMessage,
          timestamp: Date.now(),
        }}});
        return;
      }
    }
    // ── End Command Router ──────────────────────────────────────────────

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

    // Recall long-term memories relevant to this message
    let memoryContext = '';
    try {
      const ipc = (window as any).ipcRenderer;
      if (ipc) {
        memoryContext = await ipc.invoke('memory:buildContext', { query: content });
      }
    } catch {
      // Memory recall failed silently
    }

    if (settings.systemPrompt) {
      ollamaMessages.push({ role: 'system', content: settings.systemPrompt + memoryContext });
    } else if (memoryContext) {
      ollamaMessages.push({ role: 'system', content: memoryContext });
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

    let model = settings.model;
    let providerId = 'ollama-default';
    let usedFallback = false;

    if (activeModelOverride) {
      model = activeModelOverride.model;
      providerId = activeModelOverride.providerId;
    } else {
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
        providerId = routing.providerId || 'ollama-default';
        usedFallback = routing.usedFallback;
        if (usedFallback) {
          showToast(`Using fallback model: ${model}`, 'info');
        }
      } catch (err) {
        console.warn('Failed to resolve model, using default:', err);
      }
    }

    const streamId = `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const currentStreamIdRef = { current: streamId };
    const streamStartTime = Date.now();
    abortControllerRef.current = { abort: () => ollamaService.abortIPCStream(streamId) } as AbortController;

    let fullContent = '';

    const removeChunkListener = ollamaService.onStreamChunk((data) => {
      if (data.streamId !== currentStreamIdRef.current) return;
      if (data.content) {
        fullContent += data.content;
        dispatch({
          type: 'UPDATE_MESSAGE',
          payload: {
            conversationId: convId,
            messageId: assistantMessage.id,
            content: fullContent,
            isStreaming: !data.done,
          },
        });
      }
      if (data.done) {
        const usageInfo = data.usage ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
          costUsd: 0,
          durationMs: Date.now() - streamStartTime,
          model,
          providerId,
        } : undefined;

        dispatch({
          type: 'UPDATE_MESSAGE',
          payload: {
            conversationId: convId,
            messageId: assistantMessage.id,
            content: fullContent,
            isStreaming: false,
            usage: usageInfo,
          },
        });

        // Background tasks after response completes (non-blocking)
        const ipc = (window as any).ipcRenderer;
        if (ipc && content.length > 20) {
          const excerpt = `User: ${content.slice(0, 500)}\nAssistant: ${fullContent.slice(0, 500)}`;

          // 1. Generate follow-up suggestions
          ollamaService.chatComplete('ollama-default', model, [
            { role: 'user', content: `Based on this conversation, suggest exactly 3 short follow-up questions or actions the user might want to do next. Each should be under 8 words. Return ONLY a JSON array of 3 strings, no explanation.\n\nUser: ${content.slice(0, 300)}\nAssistant: ${fullContent.slice(0, 500)}` }
          ], { temperature: 0.5, max_tokens: 200 }, 'suggestions').then(result => {
            try {
              const match = result.content.match(/\[[\s\S]*\]/);
              if (match) {
                const suggestions = JSON.parse(match[0]).filter((s: any) => typeof s === 'string').slice(0, 3);
                if (suggestions.length > 0) {
                  dispatch({ type: 'UPDATE_MESSAGE', payload: {
                    conversationId: convId,
                    messageId: assistantMessage.id,
                    suggestions,
                  }});
                }
              }
            } catch { /* best-effort */ }
          }).catch(() => {});

          // 2. Auto-extract memories
          ipc.invoke('memory:getExtractionPrompt', { conversationText: excerpt }).then(async (prompt: string) => {
            try {
              const result = await ollamaService.chatComplete('ollama-default', model, [
                { role: 'user', content: prompt }
              ], { temperature: 0.1 }, 'memory_extraction');
              const jsonMatch = result.content.match(/\[[\s\S]*\]/);
              if (jsonMatch) {
                const facts = JSON.parse(jsonMatch[0]);
                for (const fact of facts) {
                  if (fact.content && fact.category) {
                    await ipc.invoke('memory:add', {
                      category: fact.category,
                      content: fact.content,
                      source: 'auto',
                      importance: fact.importance || 1,
                    });
                  }
                }
              }
            } catch { /* best-effort */ }
          }).catch(() => {});
        }

        cleanup();
      }
    });

    const removeErrorListener = ollamaService.onStreamError((data) => {
      if (data.streamId !== currentStreamIdRef.current) return;
      dispatch({
        type: 'UPDATE_MESSAGE',
        payload: {
          conversationId: convId,
          messageId: assistantMessage.id,
          content: `⚠️ **Error**: ${data.error}\n\nCheck that your provider is configured and running in Settings → Providers.`,
          isStreaming: false,
        },
      });
      cleanup();
    });

    const cleanup = () => {
      removeChunkListener();
      removeErrorListener();
      setIsStreaming(false);
      abortControllerRef.current = null;
    };

    try {
      await ollamaService.startIPCStream(
        streamId,
        providerId,
        model,
        ollamaMessages,
        {
          temperature: settings.temperature,
          top_p: settings.topP,
          num_ctx: settings.contextLength,
        },
        assistantMessage.id,
        convId
      );
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      dispatch({
        type: 'UPDATE_MESSAGE',
        payload: {
          conversationId: convId,
          messageId: assistantMessage.id,
          content: `⚠️ **Error**: ${errorMsg}\n\nCheck that your provider is configured and running in Settings → Providers.`,
          isStreaming: false,
        },
      });
      cleanup();
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

    const handleOnboard = () => {
      if (!workspace.rootPath) {
        onOpenFilePanel?.();
        return;
      }
      dispatch({ type: 'CREATE_CONVERSATION', payload: { model: settings.model } });
      setPendingPrompt('/onboard');
    };

    const quickActions = [
      { label: 'New Chat', icon: 'chat', action: () => dispatch({ type: 'CREATE_CONVERSATION', payload: { model: settings.model } }) },
      { label: 'Open Project', icon: 'folder', action: () => onOpenFilePanel?.() },
      { label: 'Onboard', icon: 'scan', action: handleOnboard },
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
            <img src={HeaderLogo} alt="Code Police" className="dashboard-logo-img" />
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
                  {item.icon === 'scan' && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
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
          {activeConversation.messages.length === 0 && (() => {
            return (
              <div className="empty-chat">
                <p className="empty-hint">Type a message to start the conversation</p>
              </div>
            );
          })()}
          {activeConversation.messages.map((msg, idx) => (
            <MessageBubble
              key={msg.id}
              role={msg.role as 'user' | 'assistant' | 'system'}
              content={msg.content}
              isStreaming={msg.isStreaming}
              timestamp={msg.timestamp}
              usage={msg.usage}
              suggestions={idx === activeConversation.messages.length - 1 ? msg.suggestions : undefined}
              onEdit={msg.role === 'user' ? (newContent) => handleEditMessage(msg.id, newContent) : undefined}
              onRegenerate={msg.role === 'assistant' ? () => handleRegenerate(msg.id) : undefined}
              onDelete={() => handleDeleteMessage(msg.id)}
              onSendFollowUp={(text) => sendMessage(text, [])}
              onRememberText={(text) => {
                const ipc = (window as any).ipcRenderer;
                ipc?.invoke('memory:add', { category: 'general', content: text, source: 'selection' });
                showToast('Saved to memory', 'success');
              }}
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
            activeModel={activeModelOverride}
            onModelChange={setActiveModelOverride}
          />
        </div>
      </div>

      {showSemanticSearch && (
        <SemanticSearchModal
          onClose={() => setShowSemanticSearch(false)}
          onAddResults={handleAddSemanticResults}
        />
      )}

      {/* RefactorModal removed — security scanner mode */}
    </div>
  );
});

export default ChatView;
