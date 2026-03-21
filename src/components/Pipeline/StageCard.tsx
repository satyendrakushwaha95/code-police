import { useState, useCallback } from 'react';
import type { StageResult, ReviewResult, CodeOutput, ExecuteResult, ValidationResult } from '../../hooks/usePipeline';
import './StageCard.css';

interface StageCardProps {
  stage: 'plan' | 'action' | 'review' | 'validate' | 'execute';
  result?: StageResult<any>;
  attempt?: number;
}

const STAGE_LABELS: Record<string, string> = {
  plan: 'Plan',
  action: 'Action',
  review: 'Review',
  validate: 'Validate',
  execute: 'Execute'
};

function getLanguageFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const langMap: Record<string, string> = {
    ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
    py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java',
    css: 'css', scss: 'scss', html: 'html', json: 'json', md: 'markdown',
    yml: 'yaml', yaml: 'yaml', sql: 'sql', sh: 'bash'
  };
  return langMap[ext] || 'text';
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  const lines = code.split('\n');
  const lineCount = lines.length;
  
  const copyToClipboard = useCallback(() => {
    navigator.clipboard.writeText(code);
  }, [code]);

  return (
    <div className="code-block">
      <div className="code-header">
        <span className="code-lang">{language}</span>
        <span className="code-lines">{lineCount} lines</span>
        <button className="copy-btn" onClick={copyToClipboard} title="Copy to clipboard">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
          </svg>
        </button>
      </div>
      <div className="code-content">
        <div className="line-numbers">
          {lines.map((_, i) => (
            <span key={i} className="line-number">{i + 1}</span>
          ))}
        </div>
        <pre className="code-text"><code>{code}</code></pre>
      </div>
    </div>
  );
}

export default function StageCard({ stage, result, attempt }: StageCardProps) {
  const [showOutput, setShowOutput] = useState(false);
  const [expandedFiles, setExpandedFiles] = useState<Set<number>>(new Set([0]));
  const status = result?.status || 'pending';
  const modelUsed = result?.model_used || '';
  const durationMs = result?.duration_ms;
  const output = result?.output;
  const error = result?.error;

  const toggleFile = (idx: number) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  };

  const getStatusIcon = () => {
    if (status === 'running') {
      return <span className="spinner">&#9696;</span>;
    }
    if (status === 'complete') {
      return <span className="status-icon complete">&#10003;</span>;
    }
    if (status === 'failed') {
      return <span className="status-icon failed">&#10007;</span>;
    }
    return null;
  };

  const renderVerdict = () => {
    if (!output || stage !== 'review') return null;
    const reviewResult = output as ReviewResult;
    if (!reviewResult.verdict) return null;

    const isPass = reviewResult.verdict === 'PASS';
    return (
      <div className={`verdict-badge ${isPass ? 'pass' : 'fail'}`}>
        {reviewResult.verdict}
      </div>
    );
  };

  const renderIssues = () => {
    if (!output || stage !== 'review') return null;
    const reviewResult = output as ReviewResult;
    if (!reviewResult.issues || reviewResult.issues.length === 0) return null;

    return (
      <div className="issues-list">
        <h4 className="issues-title">Issues Found ({reviewResult.issues.length})</h4>
        {reviewResult.issues.map((issue, idx) => (
          <div key={idx} className={`issue-item ${issue.severity}`}>
            <span className={`issue-icon ${issue.severity}`}></span>
            <div className="issue-content">
              <span className="issue-desc">{issue.description}</span>
              {issue.file && <span className="issue-file">{issue.file}</span>}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderCodeChanges = () => {
    if (!output || stage !== 'action') return null;
    const codeOutput = output as CodeOutput;
    if (!codeOutput.file_changes || codeOutput.file_changes.length === 0) return null;

    const fileCount = codeOutput.file_changes.length;

    return (
      <div className="file-changes-container">
        <div className="files-header">
          <span className="files-count">{fileCount} file{fileCount !== 1 ? 's' : ''}</span>
          {codeOutput.summary && (
            <div className="code-summary">{codeOutput.summary}</div>
          )}
        </div>
        
        <div className="file-tabs">
          {codeOutput.file_changes.map((file, idx) => (
            <button
              key={idx}
              className={`file-tab ${expandedFiles.has(idx) ? 'active' : ''}`}
              onClick={() => toggleFile(idx)}
            >
              <span className={`tab-indicator ${file.operation}`}>
                {file.operation === 'create' ? 'A' : file.operation === 'modify' ? 'M' : 'D'}
              </span>
              <span className="tab-name">{file.file_path.split('/').pop()}</span>
            </button>
          ))}
        </div>

        <div className="file-changes-list">
          {codeOutput.file_changes.map((file, idx) => (
            <div 
              key={idx} 
              className={`file-change-item ${file.operation} ${expandedFiles.has(idx) ? 'expanded' : 'collapsed'}`}
            >
              {expandedFiles.has(idx) && (
                <>
                  <div className="file-change-header">
                    <span className={`operation-badge ${file.operation}`}>
                      {file.operation === 'create' ? 'New' : 
                       file.operation === 'modify' ? 'Mod' : 
                       'Del'}
                    </span>
                    <span className="file-path">{file.file_path}</span>
                  </div>
                  {file.explanation && (
                    <div className="file-explanation">{file.explanation}</div>
                  )}
                  {file.content && (
                    <CodeBlock 
                      code={file.content} 
                      language={getLanguageFromPath(file.file_path)} 
                    />
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderExecuteResults = () => {
    if (!output || stage !== 'execute') return null;
    const executeResult = output as ExecuteResult;
    
    return (
      <div className="execute-results">
        {executeResult.executed_files.length > 0 && (
          <div className="result-section success">
            <h4>Executed Successfully ({executeResult.executed_files.length})</h4>
            <ul>
              {executeResult.executed_files.map((file, idx) => (
                <li key={idx} className="success-item">{file}</li>
              ))}
            </ul>
          </div>
        )}
        {executeResult.failed_files.length > 0 && (
          <div className="result-section failed">
            <h4>Failed ({executeResult.failed_files.length})</h4>
            <ul>
              {executeResult.failed_files.map((file, idx) => (
                <li key={idx} className="failed-item">{file}</li>
              ))}
            </ul>
          </div>
        )}
        {executeResult.summary && (
          <div className="execute-summary">{executeResult.summary}</div>
        )}
      </div>
    );
  };

  const renderValidationResults = () => {
    if (!output || stage !== 'validate') return null;
    const validationResult = output as ValidationResult;
    
    return (
      <div className="validation-results">
        <div className={`validation-badge ${validationResult.passed ? 'pass' : 'fail'}`}>
          <span className="badge-icon">{validationResult.passed ? '✓' : '✗'}</span>
          <span className="badge-text">{validationResult.passed ? 'PASSED' : 'FAILED'}</span>
          <span className="coverage-score">Coverage: {validationResult.coverage_score}%</span>
        </div>
        <div className="validation-summary">{validationResult.summary}</div>
        {validationResult.gaps && validationResult.gaps.length > 0 && (
          <div className="gaps-section">
            <h4>Gaps Found ({validationResult.gaps.length})</h4>
            {validationResult.gaps.map((gap, idx) => (
              <div key={idx} className={`gap-item ${gap.type}`}>
                <span className="gap-icon">
                  {gap.type === 'missing' ? '🔴' : gap.type === 'incomplete' ? '🟡' : gap.type === 'regressed' ? '⚠️' : '✗'}
                </span>
                <div className="gap-content">
                  <span className="gap-desc">{gap.description}</span>
                  {gap.related_to && <span className="gap-related">→ {gap.related_to}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderValidationBadge = () => {
    if (!output || stage !== 'validate') return null;
    const validationResult = output as ValidationResult;
    return (
      <div className={`verdict-badge ${validationResult.passed ? 'pass' : 'fail'}`}>
        {validationResult.passed ? 'PASS' : 'FAIL'} ({validationResult.coverage_score}%)
      </div>
    );
  };

  const formatDuration = () => {
    if (!durationMs) return '';
    if (durationMs < 1000) return `${durationMs}ms`;
    return `${(durationMs / 1000).toFixed(1)}s`;
  };

  return (
    <div className={`stage-card ${status}`}>
      <div className="stage-header" onClick={() => setShowOutput(!showOutput)}>
        {getStatusIcon() && <span className="stage-icon">{getStatusIcon()}</span>}
        <span className="stage-name">
          {STAGE_LABELS[stage]}
          {attempt && attempt > 1 && <span className="attempt-badge">Attempt {attempt}</span>}
        </span>
        {modelUsed && <span className="model-badge">{modelUsed}</span>}
        {durationMs && status === 'complete' && (
          <span className="duration-badge">{formatDuration()}</span>
        )}
        {renderVerdict()}
        {renderValidationBadge()}
        <button className="toggle-output-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
            {showOutput ? <polyline points="6 9 12 15 18 9"/> : <polyline points="9 18 15 12 9 6"/>}
          </svg>
        </button>
      </div>

      {showOutput && (
        <div className="stage-output">
          {error ? (
            <div className="error-box">
              <strong>Error:</strong> {error}
            </div>
          ) : output ? (
            <>
              {renderCodeChanges()}
              {renderValidationResults()}
              {renderExecuteResults()}
              {stage !== 'action' && stage !== 'execute' && stage !== 'validate' && (
                <div className="output-json-container">
                  <div className="output-json-header">
                    <span>Output</span>
                    <button 
                      className="copy-btn" 
                      onClick={() => navigator.clipboard.writeText(JSON.stringify(output, null, 2))}
                      title="Copy to clipboard"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                      </svg>
                    </button>
                  </div>
                  <pre className="output-json">
                    {JSON.stringify(output, null, 2)}
                  </pre>
                </div>
              )}
              {renderIssues()}
            </>
          ) : (
            <div className="no-output">
              {status === 'running' ? 'Processing...' : 'Waiting...'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
