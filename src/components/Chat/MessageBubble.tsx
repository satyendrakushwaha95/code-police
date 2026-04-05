import { useState, useEffect, useMemo, useCallback } from 'react';
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
  pipelineStatus?: 'starting' | 'running' | 'complete' | 'failed' | 'cancelled';
  pipelineRunId?: string;
  usage?: MessageUsage;
  onEdit?: (newContent: string) => void;
  onRegenerate?: () => void;
  onDelete?: () => void;
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

export default function MessageBubble({
  role, content, isStreaming, timestamp, isPipeline, pipelineStatus, usage, onEdit, onRegenerate, onDelete
}: MessageBubbleProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(content);
  const [showActions, setShowActions] = useState(false);

  useEffect(() => {
    setEditContent(content);
  }, [content]);

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

  return (
    <div
      className={`message-bubble ${role} ${isStreaming ? 'streaming' : ''} fade-in`}
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
          <div className="message-content">
            {renderMarkdown(content)}
            {isStreaming && (
              <div className="typing-indicator">
                <span className="dot"></span>
                <span className="dot"></span>
                <span className="dot"></span>
              </div>
            )}
            {isPipeline && pipelineStatus && pipelineStatus !== 'running' && (
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
          </div>
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
      </div>
    </div>
  );
}
