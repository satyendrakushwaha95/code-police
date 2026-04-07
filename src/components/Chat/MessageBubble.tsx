import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { marked } from 'marked';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.css';
import MermaidRenderer from './MermaidRenderer';

interface CodeBlockProps {
  code: string;
  language?: string;
}

function CodeBlock({ code, language }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = code;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const displayLang = language || 'text';

  const highlightedCode = useMemo(() => {
    if (language && hljs.getLanguage(language)) {
      try {
        return hljs.highlight(code, { language }).value;
      } catch {
        return hljs.highlightAuto(code).value;
      }
    }
    return hljs.highlightAuto(code).value;
  }, [code, language]);

  return (
    <div className="code-block">
      <div className="code-block-header">
        <span className="code-lang">{displayLang}</span>
        <button className="code-copy-btn" onClick={handleCopy}>
          {copied ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
              Copied!
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
              Copy
            </>
          )}
        </button>
      </div>
      <pre className="code-block-content"><code dangerouslySetInnerHTML={{ __html: highlightedCode }} /></pre>
    </div>
  );
}

interface MessageUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  durationMs: number;
  model?: string;
  providerId?: string;
}

interface MessageBubbleProps {
  role: 'user' | 'assistant' | 'system';
  content: string;
  isStreaming?: boolean;
  timestamp: number;
  isPipeline?: boolean;
  pipelineStatus?: 'starting' | 'running' | 'complete' | 'failed' | 'cancelled' | 'awaiting_approval';
  pipelineRunId?: string;
  approvalData?: { runId: string; stage: string };
  usage?: MessageUsage;
  suggestions?: string[];
  onEdit?: (newContent: string) => void;
  onRegenerate?: () => void;
  onDelete?: () => void;
  onSendFollowUp?: (text: string) => void;
  onRememberText?: (text: string) => void;
  onApprovalDecision?: (decision: 'approve' | 'reject') => void;
}

function formatTokenCount(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function formatCost(usd: number): string {
  if (usd === 0) return 'Free';
  if (usd < 0.001) return `$${usd.toFixed(6)}`;
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

type ViewMode = 'rendered' | 'raw' | 'preview';

const COLLAPSE_LINE_THRESHOLD = 40;
const COLLAPSE_CHAR_THRESHOLD = 2500;

export default function MessageBubble({
  role, content, isStreaming, timestamp, isPipeline, pipelineStatus, usage,
  approvalData, suggestions, onEdit, onRegenerate, onDelete, onSendFollowUp,
  onRememberText, onApprovalDecision,
}: MessageBubbleProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(content);
  const [showActions, setShowActions] = useState(false);
  const [selectionToolbar, setSelectionToolbar] = useState<{ text: string; x: number; y: number } | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('rendered');
  const [isCollapsed, setIsCollapsed] = useState(true);
  const messageContentRef = useRef<HTMLDivElement>(null);

  const isLongContent = !isStreaming && role === 'assistant' &&
    (content.split('\n').length > COLLAPSE_LINE_THRESHOLD || content.length > COLLAPSE_CHAR_THRESHOLD);

  useEffect(() => {
    setEditContent(content);
  }, [content]);

  const handleTextSelect = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      setSelectionToolbar(null);
      return;
    }
    const selectedText = selection.toString().trim();
    if (selectedText.length < 3) { setSelectionToolbar(null); return; }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const containerRect = messageContentRef.current?.getBoundingClientRect();
    if (!containerRect) return;

    setSelectionToolbar({
      text: selectedText,
      x: rect.left - containerRect.left + rect.width / 2,
      y: rect.top - containerRect.top - 8,
    });
  }, []);

  useEffect(() => {
    const handleClickOutside = () => setSelectionToolbar(null);
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSaveEdit = () => {
    if (editContent.trim() && onEdit) {
      onEdit(editContent.trim());
    }
    setIsEditing(false);
  };

  const renderMarkdown = useCallback((text: string) => {
    // Custom renderer for marked
    const renderer = new marked.Renderer();

    // Collect code blocks to render as React components
    const codeBlocks: { id: string; code: string; language: string }[] = [];

    renderer.code = function({ text, lang }: { text: string; lang?: string }) {
      const id = `cb-${codeBlocks.length}`;
      codeBlocks.push({ id, code: text, language: lang || '' });
      return `<div data-code-block="${id}"></div>`;
    };

    renderer.link = function({ href, text }: { href: string; text: string }) {
      return `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    };

    const rawHtml = marked.parse(text, { renderer, async: false }) as string;

    // Split HTML by code block placeholders and interleave with CodeBlock components
    const parts: (string | { id: string; code: string; language: string })[] = [];
    let remaining = rawHtml;

    for (const block of codeBlocks) {
      const placeholder = `<div data-code-block="${block.id}"></div>`;
      const idx = remaining.indexOf(placeholder);
      if (idx >= 0) {
        if (idx > 0) parts.push(remaining.substring(0, idx));
        parts.push(block);
        remaining = remaining.substring(idx + placeholder.length);
      }
    }
    if (remaining) parts.push(remaining);

    return (
      <>
        {parts.map((part, i) => {
          if (typeof part === 'string') {
            return <div key={i} className="markdown-content" dangerouslySetInnerHTML={{ __html: part }} />;
          }
          // Render mermaid diagrams
          if (part.language === 'mermaid' || part.language.startsWith('mermaid')) {
            return <MermaidRenderer key={part.id} code={part.code} />;
          }
          return <CodeBlock key={part.id} code={part.code} language={part.language} />;
        })}
      </>
    );
  }, []);

  if (role === 'system') return null;

  const timeStr = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const isApprovalRequest = isPipeline && pipelineStatus === 'awaiting_approval';

  return (
    <div
      className={`message-bubble ${role} ${isStreaming ? 'streaming' : ''} ${isApprovalRequest ? 'approval-request' : ''} fade-in`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className="message-avatar">
        {role === 'user' ? (
          <div className="avatar user-avatar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </div>
        ) : (
          <div className="avatar assistant-avatar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
          </div>
        )}
      </div>

      <div className="message-body">
        <div className="message-header">
          <span className="message-role">{role === 'user' ? 'You' : 'LocalMind'}</span>
          <span className="message-time">{timeStr}</span>
          {role === 'assistant' && !isStreaming && content.length > 50 && (
            <div className="view-mode-toggle">
              <button className={`view-mode-btn ${viewMode === 'rendered' ? 'active' : ''}`} onClick={() => setViewMode('rendered')} title="Rendered">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              </button>
              <button className={`view-mode-btn ${viewMode === 'raw' ? 'active' : ''}`} onClick={() => setViewMode('raw')} title="Raw Markdown">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
              </button>
              <button className={`view-mode-btn ${viewMode === 'preview' ? 'active' : ''}`} onClick={() => setViewMode('preview')} title="Clean Preview">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              </button>
            </div>
          )}
        </div>

        {isEditing ? (
          <div className="message-edit">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="edit-textarea"
              rows={4}
              autoFocus
            />
            <div className="edit-actions">
              <button className="btn btn-primary" onClick={handleSaveEdit}>Save & Submit</button>
              <button className="btn btn-secondary" onClick={() => setIsEditing(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <div
            className={`message-content ${isLongContent && isCollapsed ? 'collapsed-content' : ''}`}
            ref={messageContentRef}
            onMouseUp={role === 'assistant' ? handleTextSelect : undefined}
            style={{ position: 'relative' }}
          >
            {viewMode === 'rendered' && renderMarkdown(content)}
            {viewMode === 'raw' && <pre className="raw-content">{content}</pre>}
            {viewMode === 'preview' && (
              <div className="preview-content">
                {renderMarkdown(content)}
              </div>
            )}
            {isStreaming && (
              <div className="typing-indicator">
                <span className="dot"></span>
                <span className="dot"></span>
                <span className="dot"></span>
              </div>
            )}
            {isPipeline && pipelineStatus && pipelineStatus !== 'running' && pipelineStatus !== 'awaiting_approval' && (
              <div className={`pipeline-status ${pipelineStatus}`}>
                <span className="pipeline-icon">
                  {pipelineStatus === 'starting' && ''}
                  {pipelineStatus === 'complete' && ''}
                  {pipelineStatus === 'failed' && ''}
                  {pipelineStatus === 'cancelled' && ''}
                </span>
                <span className="pipeline-label">
                  {pipelineStatus === 'complete' && 'Pipeline Completed'}
                  {pipelineStatus === 'failed' && 'Pipeline Failed'}
                  {pipelineStatus === 'cancelled' && 'Pipeline Cancelled'}
                </span>
              </div>
            )}

            {isPipeline && pipelineStatus === 'awaiting_approval' && onApprovalDecision && (
              <div className="pipeline-approval-actions">
                <div className="approval-header">
                  <span className="approval-pulse" />
                  <span className="approval-title">Approval Required</span>
                  <span className="approval-stage-pill">{approvalData?.stage}</span>
                </div>
                <p className="approval-hint">Review the output above, then approve to continue the pipeline or reject to stop.</p>
                <div className="approval-buttons">
                  <button
                    className="approval-btn approve"
                    onClick={() => onApprovalDecision('approve')}
                  >
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    Approve &amp; Continue
                  </button>
                  <button
                    className="approval-btn reject"
                    onClick={() => onApprovalDecision('reject')}
                  >
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    Reject &amp; Stop
                  </button>
                </div>
              </div>
            )}

            {/* Selection toolbar */}
            {selectionToolbar && (
              <div
                className="selection-toolbar"
                style={{ left: selectionToolbar.x, top: selectionToolbar.y }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <button onClick={() => { onSendFollowUp?.(`Explain this:\n\n${selectionToolbar.text}`); setSelectionToolbar(null); }}>Explain</button>
                <button onClick={() => { onSendFollowUp?.(`Refactor this code:\n\n\`\`\`\n${selectionToolbar.text}\n\`\`\``); setSelectionToolbar(null); }}>Refactor</button>
                <button onClick={() => { onRememberText?.(selectionToolbar.text); setSelectionToolbar(null); }}>Remember</button>
                <button onClick={() => { navigator.clipboard.writeText(selectionToolbar.text); setSelectionToolbar(null); }}>Copy</button>
              </div>
            )}

            {/* Collapse gradient overlay */}
            {isLongContent && isCollapsed && (
              <div className="collapse-gradient" />
            )}
          </div>
        )}

        {/* Show more / Show less toggle */}
        {isLongContent && (
          <button className="collapse-toggle-btn" onClick={() => setIsCollapsed(!isCollapsed)}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
              {isCollapsed
                ? <><path d="M6 9l6 6 6-6"/></>
                : <><path d="M18 15l-6-6-6 6"/></>
              }
            </svg>
            {isCollapsed
              ? `Show full response (${content.split('\n').length} lines)`
              : 'Collapse'
            }
          </button>
        )}

        {role === 'assistant' && usage && !isStreaming && (
          <div className="message-usage-bar">
            <span className="usage-chip" title={`Input: ${usage.promptTokens} | Output: ${usage.completionTokens}`}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
              {formatTokenCount(usage.totalTokens)} tokens
            </span>
            {usage.costUsd > 0 && (
              <span className="usage-chip cost" title={`$${usage.costUsd.toFixed(6)}`}>
                {formatCost(usage.costUsd)}
              </span>
            )}
            {usage.costUsd === 0 && (
              <span className="usage-chip free">Free</span>
            )}
            {usage.durationMs > 0 && (
              <span className="usage-chip" title="Response time">
                {(usage.durationMs / 1000).toFixed(1)}s
              </span>
            )}
            {usage.model && (
              <span className="usage-chip model" title={usage.providerId || ''}>
                {usage.model}
              </span>
            )}
          </div>
        )}

        {showActions && !isEditing && !isStreaming && (
          <div className="message-actions">
            {role === 'user' && onEdit && (
              <button className="msg-action-btn" onClick={() => setIsEditing(true)} title="Edit">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
              </button>
            )}
            {role === 'assistant' && onRegenerate && (
              <button className="msg-action-btn" onClick={onRegenerate} title="Regenerate">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
              </button>
            )}
            {onDelete && (
              <button className="msg-action-btn delete" onClick={onDelete} title="Delete">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
              </button>
            )}
          </div>
        )}

        {/* Follow-up suggestion chips */}
        {role === 'assistant' && suggestions && suggestions.length > 0 && !isStreaming && (
          <div className="suggestion-chips">
            {suggestions.map((s, i) => (
              <button key={i} className="suggestion-chip" onClick={() => onSendFollowUp?.(s)}>
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
