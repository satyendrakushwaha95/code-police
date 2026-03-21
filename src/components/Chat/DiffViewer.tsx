import { useState, useMemo } from 'react';

interface DiffViewerProps {
  oldCode: string;
  newCode: string;
  oldLabel?: string;
  newLabel?: string;
}

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

type ViewMode = 'diff' | 'old' | 'new';

export default function DiffViewer({
  oldCode,
  newCode,
  oldLabel = 'Original',
  newLabel = 'Modified'
}: DiffViewerProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('diff');

  const diff = useMemo(() => {
    const oldLines = oldCode.split('\n');
    const newLines = newCode.split('\n');
    const result: DiffLine[] = [];
    
    let oldIdx = 0;
    let newIdx = 0;
    
    while (oldIdx < oldLines.length || newIdx < newLines.length) {
      const oldLine = oldLines[oldIdx];
      const newLine = newLines[newIdx];
      
      if (oldLine === newLine) {
        result.push({
          type: 'unchanged',
          content: oldLine || '',
          oldLineNumber: oldIdx + 1,
          newLineNumber: newIdx + 1
        });
        oldIdx++;
        newIdx++;
      } else if (oldLine !== undefined && newLine !== undefined) {
        const lookAhead = Math.min(5, oldLines.length - oldIdx, newLines.length - newIdx);
        let foundMatch = false;
        
        for (let i = 1; i <= lookAhead; i++) {
          const nextOld = oldLines[oldIdx + i];
          const nextNew = newLines[newIdx + i];
          
          if (nextOld === newLine) {
            for (let j = 0; j < i; j++) {
              result.push({
                type: 'removed',
                content: oldLines[oldIdx + j] || '',
                oldLineNumber: oldIdx + j + 1
              });
            }
            oldIdx += i;
            foundMatch = true;
            break;
          }
          
          if (nextNew === oldLine) {
            for (let j = 0; j < i; j++) {
              result.push({
                type: 'added',
                content: newLines[newIdx + j] || '',
                newLineNumber: newIdx + j + 1
              });
            }
            newIdx += i;
            foundMatch = true;
            break;
          }
        }
        
        if (!foundMatch) {
          result.push({
            type: 'removed',
            content: oldLine,
            oldLineNumber: oldIdx + 1
          });
          result.push({
            type: 'added',
            content: newLine,
            newLineNumber: newIdx + 1
          });
          oldIdx++;
          newIdx++;
        }
      } else if (oldLine === undefined) {
        result.push({
          type: 'added',
          content: newLine || '',
          newLineNumber: newIdx + 1
        });
        newIdx++;
      } else if (newLine === undefined) {
        result.push({
          type: 'removed',
          content: oldLine || '',
          oldLineNumber: oldIdx + 1
        });
        oldIdx++;
      }
    }
    
    return result;
  }, [oldCode, newCode]);

  const stats = useMemo(() => {
    const added = diff.filter(d => d.type === 'added').length;
    const removed = diff.filter(d => d.type === 'removed').length;
    return { added, removed };
  }, [diff]);

  const oldLines = useMemo(() => oldCode.split('\n'), [oldCode]);
  const newLines = useMemo(() => newCode.split('\n'), [newCode]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const renderCodeView = (lines: string[], label: string) => (
    <div className="diff-code-view">
      <div className="diff-code-header">
        <span className="diff-code-title">{label}</span>
        <button 
          className="diff-copy-btn"
          onClick={() => copyToClipboard(lines.join('\n'))}
          title="Copy to clipboard"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
          </svg>
        </button>
      </div>
      <div className="diff-code-content">
        {lines.map((line, idx) => (
          <div key={idx} className="diff-code-line">
            <span className="diff-line-num">{idx + 1}</span>
            <pre className="diff-line-text">{line}</pre>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="diff-viewer">
      <div className="diff-header">
        <div className="diff-tabs">
          <button 
            className={`diff-tab ${viewMode === 'diff' ? 'active' : ''}`}
            onClick={() => setViewMode('diff')}
          >
            Changes
          </button>
          <button 
            className={`diff-tab ${viewMode === 'old' ? 'active' : ''}`}
            onClick={() => setViewMode('old')}
          >
            {oldLabel}
          </button>
          <button 
            className={`diff-tab ${viewMode === 'new' ? 'active' : ''}`}
            onClick={() => setViewMode('new')}
          >
            {newLabel}
          </button>
        </div>
        <div className="diff-stats">
          <span className="diff-stat added">+{stats.added}</span>
          <span className="diff-stat removed">-{stats.removed}</span>
        </div>
      </div>
      
      <div className="diff-content">
        {viewMode === 'diff' && (
          <div className="diff-table">
            <div className="diff-line-numbers-col">
              {diff.map((line, idx) => (
                <div key={idx} className={`diff-line-num ${line.type}`}>
                  {line.type === 'removed' ? (line.oldLineNumber || '') : 
                   line.type === 'added' ? '' : 
                   (line.newLineNumber || '')}
                </div>
              ))}
            </div>
            <div className="diff-code-col">
              {diff.map((line, idx) => (
                <div key={idx} className={`diff-line ${line.type}`}>
                  <span className="line-indicator">
                    {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                  </span>
                  <pre className="line-content">{line.content}</pre>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {viewMode === 'old' && (
          <div className="diff-side-by-side">
            {renderCodeView(oldLines, oldLabel)}
          </div>
        )}
        
        {viewMode === 'new' && (
          <div className="diff-side-by-side">
            {renderCodeView(newLines, newLabel)}
          </div>
        )}
      </div>
    </div>
  );
}
