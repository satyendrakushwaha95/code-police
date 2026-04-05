import { useState, useRef, useEffect } from 'react';
import type { CompareSession, CompareResponse, CompareModelEntry } from '../../hooks/useCompare';
import CompareResponseCard from './CompareResponseCard';
import CompareModelPicker from './CompareModelPicker';
import './Compare.css';

interface ComparePanelProps {
  session: CompareSession | null;
  onStart: (prompt: string, models: CompareModelEntry[], systemPrompt?: string, options?: { temperature?: number; top_p?: number; max_tokens?: number }) => void;
  onAbort: () => void;
  onSelect: (providerId: string, model: string) => void;
  onRate: (providerId: string, model: string, rating: -1 | 0 | 1) => void;
  onUseResponse: (content: string) => void;
  onClose: () => void;
  initialPrompt?: string;
  systemPrompt?: string;
}

export default function ComparePanel({
  session,
  onStart,
  onAbort,
  onSelect,
  onRate,
  onUseResponse,
  onClose,
  initialPrompt = '',
  systemPrompt,
}: ComparePanelProps) {
  const [showPicker, setShowPicker] = useState(!session);
  const [prompt, setPrompt] = useState(initialPrompt);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialPrompt) setPrompt(initialPrompt);
  }, [initialPrompt]);

  const handleStartComparison = (models: CompareModelEntry[]) => {
    if (!prompt.trim()) return;
    setShowPicker(false);
    onStart(prompt.trim(), models, systemPrompt);
  };

  const responses: CompareResponse[] = session
    ? Array.from(session.responses.values())
    : [];

  const allDone = responses.length > 0 && responses.every(r => r.done || r.error);
  const columnCount = Math.max(responses.length, 2);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className="compare-overlay" onClick={handleOverlayClick}>
      <div className="compare-panel">
        <div className="compare-header">
          <div className="compare-header-left">
            <h3>Model Comparison</h3>
            {session?.isActive && (
              <span className="compare-status-badge running">Streaming...</span>
            )}
            {session && allDone && (
              <span className="compare-status-badge done">Complete</span>
            )}
          </div>
          <div className="compare-header-right">
            {session?.isActive && (
              <button className="btn btn-ghost btn-sm" onClick={onAbort}>Stop All</button>
            )}
            {session && allDone && (
              <button className="btn btn-secondary btn-sm" onClick={() => { setShowPicker(true); }}>
                New Comparison
              </button>
            )}
            <button className="btn-icon" onClick={onClose} title="Close">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        {session && (
          <div className="compare-prompt-bar">
            <span className="compare-prompt-label">Prompt:</span>
            <span className="compare-prompt-text">{session.prompt}</span>
          </div>
        )}

        {showPicker && (
          <div className="compare-picker-section">
            <div className="compare-prompt-input">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Enter your prompt to compare across models..."
                rows={3}
                autoFocus
              />
            </div>
            <CompareModelPicker
              onSelect={handleStartComparison}
              disabled={!prompt.trim()}
            />
          </div>
        )}

        {responses.length > 0 && !showPicker && (
          <div
            className="compare-responses-grid"
            style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}
            ref={scrollRef}
          >
            {responses.map((resp) => (
              <CompareResponseCard
                key={`${resp.providerId}::${resp.model}`}
                response={resp}
                isSelected={resp.selected || false}
                onSelect={() => onSelect(resp.providerId, resp.model)}
                onRate={(rating) => onRate(resp.providerId, resp.model, rating)}
                onUse={() => onUseResponse(resp.content)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
