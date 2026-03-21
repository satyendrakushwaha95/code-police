import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import type { FileAttachment } from '../../types/chat';
import { readFileContent, formatFileSize } from '../../services/fileReader';
import { useWorkspace } from '../../store/WorkspaceContext';
import { useSettings } from '../../store/SettingsContext';
import { useAgents } from '../../store/AgentContext';
import type { WorkspaceFile } from '../../store/WorkspaceContext';
import './Chat.css';

interface ChatInputProps {
  onSend: (message: string, attachments: FileAttachment[], runAsPipeline?: boolean, agentId?: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled: boolean;
  connected?: boolean | null;
  initialValue?: string;
}

const ChatInput = forwardRef<{ focus: () => void }, ChatInputProps>(function ChatInput(
  { onSend, onStop, isStreaming, disabled, connected, initialValue = '' },
  ref
) {
  const [input, setInput] = useState(initialValue);
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [inputMode, setInputMode] = useState<'chat' | 'agent'>('chat');
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const { settings } = useSettings();
  const { state: workspace } = useWorkspace();
  const { state: agentState } = useAgents();
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [showWorkspaceHint, setShowWorkspaceHint] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
  }));

  useEffect(() => {
    if (agentState.activeAgent) {
      setSelectedAgentId(agentState.activeAgent.id);
    }
  }, [agentState.activeAgent]);

  useEffect(() => {
    if (!showWorkspaceHint) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.send-to-agent-wrapper')) {
        setShowWorkspaceHint(false);
      }
    };
    
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showWorkspaceHint]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = '24px';
    }
  }, []);

  useEffect(() => {
    if (textareaRef.current && input) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      const maxHeight = 200;
      if (scrollHeight > maxHeight) {
        textareaRef.current.style.height = `${maxHeight}px`;
        textareaRef.current.style.overflowY = 'auto';
      } else {
        textareaRef.current.style.height = `${scrollHeight}px`;
        textareaRef.current.style.overflowY = 'hidden';
      }
    }
  }, [input]);

  const handleSubmit = useCallback(() => {
    if ((!input.trim() && attachments.length === 0) || disabled) return;
    const isAgent = inputMode === 'agent';
    const agentId = isAgent ? selectedAgentId || undefined : undefined;
    onSend(input.trim(), attachments, isAgent, agentId);
    setInput('');
    setAttachments([]);
    setInputMode('chat');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.overflowY = 'hidden';
    }
  }, [input, attachments, disabled, onSend, inputMode, selectedAgentId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showMentionMenu && filteredFiles.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(prev => (prev < filteredFiles.length - 1 ? prev + 1 : prev));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(prev => (prev > 0 ? prev - 1 : prev));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        insertMention(filteredFiles[mentionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        setShowMentionMenu(false);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInput(value);

    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = value.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@([^\s@]*)$/);

    if (atMatch) {
      setShowMentionMenu(true);
      setMentionQuery(atMatch[1]);
      setMentionStart(cursorPos - atMatch[1].length - 1);
      setMentionIndex(0);
    } else {
      setShowMentionMenu(false);
      setMentionQuery('');
      setMentionStart(null);
    }
  };

  const filteredFiles: WorkspaceFile[] = workspace.rootPath
    ? workspace.filesIndex.filter(f => {
        if (!mentionQuery) return true;
        return f.path.toLowerCase().includes(mentionQuery.toLowerCase()) ||
               f.name.toLowerCase().includes(mentionQuery.toLowerCase());
      }).slice(0, 10)
    : [];

  const insertMention = (file: WorkspaceFile) => {
    if (mentionStart === null) return;
    const before = input.slice(0, mentionStart);
    const after = input.slice(mentionStart + mentionQuery.length + 1);
    setInput(`${before}@${file.path} ${after}`);
    setShowMentionMenu(false);
    setMentionQuery('');
    setMentionStart(null);
    textareaRef.current?.focus();
  };

  const handleFileSelect = async (files: FileList | null) => {
    if (!files) return;
    const newAttachments: FileAttachment[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const attachment = await readFileContent(file);
        newAttachments.push(attachment);
      } catch (err) {
        console.error('Failed to read file:', err);
      }
    }
    setAttachments(prev => [...prev, ...newAttachments]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const removeAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  return (
    <div
      className={`chat-input-container ${isDragOver ? 'drag-over' : ''}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {attachments.length > 0 && (
        <div className="attachments-bar">
          {attachments.map(att => (
            <div key={att.id} className="file-chip">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <span className="file-name">{att.name}</span>
              <span className="file-size">{formatFileSize(att.size)}</span>
              <button className="remove-btn" onClick={() => removeAttachment(att.id)}>×</button>
            </div>
          ))}
        </div>
      )}

      <div className="input-main-row">
        <div className="input-wrapper">
          {showMentionMenu && filteredFiles.length > 0 && (
            <ul className="mention-dropdown">
              {filteredFiles.map((file, idx) => (
                <li
                  key={file.path}
                  className={`mention-item ${idx === mentionIndex ? 'active' : ''}`}
                  onClick={() => insertMention(file)}
                  onMouseEnter={() => setMentionIndex(idx)}
                >
                  <span className="mention-icon">📄</span>
                  <span className="mention-path">{file.path}</span>
                </li>
              ))}
            </ul>
          )}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={isDragOver ? 'Drop files here...' : 'Type a message... (@ to attach file, Enter to send)'}
            className="chat-textarea"
            rows={1}
            disabled={disabled}
          />
        </div>
        {isStreaming ? (
          <button className="btn-icon stop-btn" onClick={onStop} title="Stop generating">
            <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
          </button>
        ) : (
          <button
            className="btn-icon send-btn"
            onClick={handleSubmit}
            disabled={!input.trim() && attachments.length === 0}
            title="Send message"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        )}
      </div>

      <div className="input-actions-row">
        <div className="input-actions-left">
          <button
            className="btn-icon attach-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Attach files"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
            </svg>
          </button>
          {attachments.length > 0 && (
            <span className="attachment-count">{attachments.length} file(s)</span>
          )}
          <span className="model-badge">
            <span className={`status-dot ${connected ? 'connected' : 'disconnected'}`}></span>
            {settings.model}
          </span>
        </div>
        <div className="input-actions-right">
          <button
            className={`mode-btn ${inputMode === 'chat' ? 'active' : ''}`}
            onClick={() => setInputMode('chat')}
            disabled={isStreaming}
          >
            Chat
          </button>
          <div className="send-to-agent-wrapper">
            <button
              className={`mode-btn ${inputMode === 'agent' ? 'active' : ''} ${!workspace.rootPath ? 'no-workspace' : ''}`}
              onClick={() => setInputMode('agent')}
              disabled={isStreaming}
            >
              Send to Agent {!workspace.rootPath && (
                <span
                  className="mode-warning"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowWorkspaceHint(!showWorkspaceHint);
                  }}
                >
                  ⚠
                </span>
              )}
            </button>
            {showWorkspaceHint && !workspace.rootPath && (
              <div className="workspace-hint-tooltip">
                <div className="workspace-hint-content">
                  <p className="workspace-hint-title">Open a project folder first</p>
                  <p className="workspace-hint-text">
                    To use "Send to Agent", you need to open a project directory.
                  </p>
                  <div className="workspace-hint-steps">
                    <div className="workspace-hint-step">
                      <span className="step-number">1</span>
                      <span>Click the <strong>File Explorer</strong> icon in the sidebar</span>
                    </div>
                    <div className="workspace-hint-step">
                      <span className="step-number">2</span>
                      <span>Select your project folder</span>
                    </div>
                  </div>
                  <button
                    className="workspace-hint-close"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowWorkspaceHint(false);
                    }}
                  >
                    Got it
                  </button>
                </div>
                <div className="workspace-hint-arrow" />
              </div>
            )}
          </div>
          {inputMode === 'agent' && (
            <select
              className="agent-selector"
              value={selectedAgentId || ''}
              onChange={(e) => setSelectedAgentId(e.target.value || null)}
              disabled={isStreaming}
              title={!workspace.rootPath ? 'Open a workspace folder first to use agents' : ''}
            >
              {agentState.agents.length === 0 ? (
                <option value="">No agents available</option>
              ) : (
                agentState.agents.map(agent => (
                  <option key={agent.id} value={agent.id}>
                    {agent.icon} {agent.name}
                  </option>
                ))
              )}
            </select>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden-file-input"
        onChange={(e) => handleFileSelect(e.target.files)}
      />

      {isDragOver && (
        <div className="drop-overlay">
          <div className="drop-content">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            <p>Drop files to attach</p>
          </div>
        </div>
      )}
    </div>
  );
});

export default ChatInput;
