import { useRef, useEffect } from 'react';
import type { CompareResponse } from '../../hooks/useCompare';
import CodeBlock from '../common/CodeBlock';
import { marked } from 'marked';
import './Compare.css';

interface CompareResponseCardProps {
  response: CompareResponse;
  isSelected: boolean;
  onSelect: () => void;
  onRate: (rating: -1 | 0 | 1) => void;
  onUse: () => void;
}

export default function CompareResponseCard({
  response,
  isSelected,
  onSelect,
  onRate,
  onUse,
}: CompareResponseCardProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [response.content]);

  const renderContent = () => {
    if (response.error) {
      return <div className="compare-error">Error: {response.error}</div>;
    }
    if (!response.content && !response.done) {
      return <div className="compare-waiting">Waiting for response...</div>;
    }
    try {
      const html = marked.parse(response.content || '', { async: false }) as string;
      return <div className="compare-markdown" dangerouslySetInnerHTML={{ __html: html }} />;
    } catch {
      return <pre className="compare-raw">{response.content}</pre>;
    }
  };

  return (
    <div className={`compare-response-card ${isSelected ? 'selected' : ''} ${response.done ? '' : 'streaming'}`}>
      <div className="compare-card-header">
        <div className="compare-card-model">
          <span className="compare-card-model-name">{response.model}</span>
          {!response.done && !response.error && (
            <span className="compare-streaming-dot"></span>
          )}
        </div>
      </div>

      <div className="compare-card-content" ref={contentRef}>
        {renderContent()}
      </div>

      <div className="compare-card-footer">
        <div className="compare-card-stats">
          {response.durationMs > 0 && (
            <span className="compare-stat">{(response.durationMs / 1000).toFixed(1)}s</span>
          )}
          {response.usage && (
            <span className="compare-stat">{response.usage.completion_tokens} tok</span>
          )}
        </div>
        <div className="compare-card-actions">
          <button
            className={`rate-btn ${response.rating === 1 ? 'active-good' : ''}`}
            onClick={() => onRate(response.rating === 1 ? 0 : 1)}
            title="Good response"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
            </svg>
          </button>
          <button
            className={`rate-btn ${response.rating === -1 ? 'active-bad' : ''}`}
            onClick={() => onRate(response.rating === -1 ? 0 : -1)}
            title="Bad response"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/>
            </svg>
          </button>
          <button
            className="btn btn-primary btn-sm compare-use-btn"
            onClick={onUse}
            disabled={!response.done || !!response.error}
          >
            Use This
          </button>
        </div>
      </div>
    </div>
  );
}
