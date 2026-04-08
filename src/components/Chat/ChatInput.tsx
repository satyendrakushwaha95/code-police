import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import type { FileAttachment } from '../../types/chat';
import { readFileContent, formatFileSize } from '../../services/fileReader';
import { useWorkspace } from '../../store/WorkspaceContext';
import { useSettings } from '../../store/SettingsContext';
import { getSlashCommandHints } from '../../services/command-router';
import type { WorkspaceFile } from '../../store/WorkspaceContext';
import './Chat.css';

interface ChatInputProps {
  onSend: (message: string, attachments: FileAttachment[]) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled: boolean;
  connected?: boolean | null;
  initialValue?: string;
  activeModel?: { providerId: string; model: string } | null;
  onModelChange?: (selection: { providerId: string; model: string } | null) => void;
}

const ipcRendererLocal = (window as any).ipcRenderer;

const EMBEDDING_PATTERNS = [
  'embed', 'nomic-embed', 'mxbai-embed', 'all-minilm', 'bge-',
  'snowflake-arctic-embed', 'e5-', 'gte-', 'jina-embed',
  'text-embedding', 'voyage-', 'cohere-embed',
];

function isEmbeddingModel(name: string): boolean {
  const lower = name.toLowerCase();
  return EMBEDDING_PATTERNS.some(p => lower.includes(p));
}

const ChatInput = forwardRef<{ focus: () => void }, ChatInputProps>(function ChatInput(
  { onSend, onStop, isStreaming, disabled, connected, initialValue = '', activeModel, onModelChange },
  ref
) {
  const [input, setInput] = useState(initialValue);
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const { settings } = useSettings();
  const { state: workspace } = useWorkspace();
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);
  const [pasteHint, setPasteHint] = useState<{ type: string; label: string } | null>(null);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [providerModels, setProviderModels] = useState<Array<{ id: string; name: string; providerId: string; providerName: string; size?: number }>>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
  }));

  useEffect(() => {
    if (!showModelPicker) return;
    const handle = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.model-picker-wrapper')) setShowModelPicker(false);
    };
    document.addEventListener('click', handle);
    return () => document.removeEventListener('click', handle);
  }, [showModelPicker]);

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
    onSend(input.trim(), attachments);
    setInput('');
    setAttachments([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.overflowY = 'hidden';
    }
  }, [input, attachments, disabled, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showSlashMenu && filteredSlashHints.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashIndex(prev => (prev < filteredSlashHints.length - 1 ? prev + 1 : prev));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashIndex(prev => (prev > 0 ? prev - 1 : prev));
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !input.includes(' '))) {
        e.preventDefault();
        insertSlashCommand(filteredSlashHints[slashIndex].command);
        return;
      }
      if (e.key === 'Escape') {
        setShowSlashMenu(false);
        return;
      }
    }
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

    // Slash command detection
    if (value.startsWith('/')) {
      setShowSlashMenu(true);
      setSlashQuery(value.slice(1).toLowerCase());
      setSlashIndex(0);
    } else if (value.startsWith('$')) {
      setShowSlashMenu(false);
    } else {
      setShowSlashMenu(false);
    }

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

  const allSlashHints = getSlashCommandHints();
  const filteredSlashHints = slashQuery
    ? allSlashHints.filter(h => h.command.toLowerCase().includes(slashQuery) || h.description.toLowerCase().includes(slashQuery))
    : allSlashHints;

  const insertSlashCommand = (cmd: string) => {
    const base = cmd.split(' ')[0];
    setInput(base + ' ');
    setShowSlashMenu(false);
    textareaRef.current?.focus();
  };

  const handleSmartPaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text/plain');
    if (!text || text.length < 10) return;

    // Detect content type
    const detectors: Array<{ type: string; label: string; test: (t: string) => boolean; wrap: (t: string) => string }> = [
      {
        type: 'stacktrace',
        label: 'Stack Trace',
        test: (t) => /at\s+[\w.]+\s*\(|Traceback|Exception|Error:\s|\.py",\s*line\s+\d+|\.js:\d+:\d+|\.ts:\d+:\d+/m.test(t),
        wrap: (t) => `I got this error. Help me fix it:\n\n\`\`\`\n${t}\n\`\`\``,
      },
      {
        type: 'json',
        label: 'JSON',
        test: (t) => { try { const p = JSON.parse(t.trim()); return typeof p === 'object' && p !== null; } catch { return false; } },
        wrap: (t) => { try { return `\`\`\`json\n${JSON.stringify(JSON.parse(t.trim()), null, 2)}\n\`\`\``; } catch { return t; } },
      },
      {
        type: 'command',
        label: 'Terminal Command',
        test: (t) => /^\s*\$\s+/.test(t) || /^\s*(npm|yarn|pnpm|pip|cargo|go|docker|git|curl|wget|make|sudo)\s+/m.test(t),
        wrap: (t) => t.replace(/^\s*\$\s*/, ''),
      },
      {
        type: 'url',
        label: 'URL',
        test: (t) => /^https?:\/\/\S+$/m.test(t.trim()),
        wrap: (t) => t,
      },
      {
        type: 'code',
        label: 'Code Snippet',
        test: (t) => {
          const codeSignals = [/^(import|from|const|let|var|function|class|def|fn|pub|package|#include)\s/m, /[{};]\s*$/m, /=>\s*{/m, /\)\s*{/m];
          return codeSignals.some(r => r.test(t));
        },
        wrap: (t) => `\`\`\`\n${t}\n\`\`\``,
      },
    ];

    for (const detector of detectors) {
      if (detector.test(text)) {
        e.preventDefault();
        const wrapped = detector.wrap(text);
        setInput(prev => prev + wrapped);
        setPasteHint({ type: detector.type, label: detector.label });
        setTimeout(() => setPasteHint(null), 3000);
        return;
      }
    }
  };

  const openModelPicker = async () => {
    if (showModelPicker) { setShowModelPicker(false); return; }
    setShowModelPicker(true);
    if (providerModels.length === 0) {
      setLoadingModels(true);
      try {
        const models = await ipcRendererLocal.invoke('provider:listAllModels');
        setProviderModels(models.filter((m: any) => !isEmbeddingModel(m.id || m.name)));
      } catch { /* */ }
      setLoadingModels(false);
    }
  };

  const modelDisplayName = activeModel
    ? activeModel.model
    : settings.model;

  const groupedModels = providerModels.reduce<Record<string, typeof providerModels>>((acc, m) => {
    const key = m.providerName || m.providerId;
    if (!acc[key]) acc[key] = [];
    acc[key].push(m);
    return acc;
  }, {});

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

      {pasteHint && (
        <div className="smart-paste-hint">
          <span className="paste-hint-icon">
            {pasteHint.type === 'stacktrace' && '🔴'}
            {pasteHint.type === 'json' && '📋'}
            {pasteHint.type === 'command' && '🖥️'}
            {pasteHint.type === 'url' && '🔗'}
            {pasteHint.type === 'code' && '💻'}
          </span>
          <span className="paste-hint-label">Detected: {pasteHint.label}</span>
          {pasteHint.type === 'stacktrace' && <span className="paste-hint-action">Auto-wrapped as error — press Enter to get a fix</span>}
          {pasteHint.type === 'json' && <span className="paste-hint-action">Auto-formatted as JSON</span>}
        </div>
      )}

      <div className="input-main-row">
        <button
          className="btn-icon attach-btn"
          onClick={() => fileInputRef.current?.click()}
          title="Attach files"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
          </svg>
        </button>

        <div className="input-wrapper">
          {showSlashMenu && filteredSlashHints.length > 0 && (
            <ul className="mention-dropdown slash-dropdown">
              {filteredSlashHints.map((hint, idx) => (
                <li
                  key={hint.command}
                  className={`mention-item ${idx === slashIndex ? 'active' : ''}`}
                  onClick={() => insertSlashCommand(hint.command)}
                  onMouseEnter={() => setSlashIndex(idx)}
                >
                  <span className="slash-cmd">{hint.command}</span>
                  <span className="slash-desc">{hint.description}</span>
                </li>
              ))}
            </ul>
          )}
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
            onPaste={handleSmartPaste}
            placeholder={isDragOver ? 'Drop files here...' : 'Ask about security, vulnerabilities, or your code...'}
            className="chat-textarea"
            rows={1}
            disabled={disabled}
          />
        </div>

        <div className="model-picker-wrapper">
          <button className="model-badge model-badge-btn" onClick={openModelPicker} title="Click to change model">
            <span className={`status-dot ${connected ? 'connected' : 'disconnected'}`}></span>
            <span className="model-badge-name">{modelDisplayName}</span>
            <svg className="model-badge-chevron" viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6"/></svg>
          </button>
          {showModelPicker && (
            <div className="model-picker-dropdown">
              <div className="model-picker-header">
                <span>Select Model</span>
                {activeModel && (
                  <button className="model-picker-reset" onClick={() => { onModelChange?.(null); setShowModelPicker(false); }}>
                    Reset to default
                  </button>
                )}
              </div>
              {loadingModels && <div className="model-picker-loading">Loading models...</div>}
              {!loadingModels && Object.keys(groupedModels).length === 0 && (
                <div className="model-picker-loading">No models available. Check Settings → Providers.</div>
              )}
              {Object.entries(groupedModels).map(([provider, models]) => (
                <div key={provider} className="model-picker-group">
                  <div className="model-picker-group-label">{provider}</div>
                  {models.map(m => (
                    <button
                      key={`${m.providerId}::${m.id}`}
                      className={`model-picker-item ${activeModel?.model === m.id && activeModel?.providerId === m.providerId ? 'active' : ''}`}
                      onClick={() => { onModelChange?.({ providerId: m.providerId, model: m.id }); setShowModelPicker(false); }}
                    >
                      <span className="model-picker-item-name">{m.name}</span>
                      {m.size && (
                        <span className="model-picker-item-size">
                          {m.size > 1e9 ? `${(m.size / 1e9).toFixed(1)}GB` : `${Math.round(m.size / 1e6)}MB`}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
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
