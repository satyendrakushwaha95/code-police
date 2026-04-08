import { useState, useCallback } from 'react';
import { useScanContext } from '../../store/ScanContext';
import type { ScanFinding } from '../../store/ScanContext';

interface FindingDetailProps {
  finding: ScanFinding;
  onClose: () => void;
}

function SectionToggle({ collapsed }: { collapsed: boolean }) {
  return (
    <span className={`finding-detail-section-toggle${collapsed ? ' collapsed' : ''}`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </span>
  );
}

function CodeWithLineNumbers({
  code,
  startLine = 1,
}: {
  code: string;
  startLine?: number;
}) {
  const lines = code.split('\n');
  return (
    <div className="finding-code-block">
      <div className="finding-code-lines">
        {lines.map((_, i) => (
          <span key={i} className="finding-code-line-num">
            {startLine + i}
          </span>
        ))}
      </div>
      <pre className="finding-code-content">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export default function FindingDetail({ finding, onClose }: FindingDetailProps) {
  const { updateFindingStatus, generateFix, applyFix } = useScanContext();

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [fixLoading, setFixLoading] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);

  const toggle = useCallback((key: string) => {
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleGenerateFix = useCallback(async () => {
    setFixLoading(true);
    try {
      await generateFix(finding.id);
    } finally {
      setFixLoading(false);
    }
  }, [generateFix, finding.id]);

  const handleApplyFix = useCallback(async () => {
    setApplyLoading(true);
    try {
      await applyFix(finding.id);
    } finally {
      setApplyLoading(false);
    }
  }, [applyFix, finding.id]);

  const handleStatusChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      updateFindingStatus(finding.id, e.target.value);
    },
    [updateFindingStatus, finding.id]
  );

  const fileLocation = finding.lineStart != null
    ? finding.lineEnd != null && finding.lineEnd !== finding.lineStart
      ? `${finding.filePath}:${finding.lineStart}-${finding.lineEnd}`
      : `${finding.filePath}:${finding.lineStart}`
    : finding.filePath;

  return (
    <div className="finding-detail">
      <div className="finding-detail-header">
        <div className="finding-detail-header-left">
          <h3 className="finding-detail-title">{finding.title}</h3>
          <span className="finding-detail-file">{fileLocation}</span>
          <div className="finding-detail-badges">
            <span className={`severity-badge sev-${finding.severity}`}>
              {finding.severity}
            </span>
            <span className={`status-badge status-${finding.status}`}>
              {finding.status === 'false_positive' ? 'False positive' : finding.status}
            </span>
            {finding.cweId && <span className="meta-badge">{finding.cweId}</span>}
            {finding.owaspCategory && <span className="meta-badge">{finding.owaspCategory}</span>}
            <span className={`meta-badge confidence-${finding.confidence}`}>
              {finding.confidence}
            </span>
          </div>
        </div>
        <button className="finding-detail-close" onClick={onClose} title="Close detail">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="finding-detail-body">
        {/* Description */}
        <div className={`finding-detail-section${collapsed['desc'] ? ' collapsed' : ''}`}>
          <div className="finding-detail-section-header" onClick={() => toggle('desc')}>
            <span className="finding-detail-section-title">Description</span>
            <SectionToggle collapsed={!!collapsed['desc']} />
          </div>
          <div className="finding-detail-section-content">
            {finding.description}
          </div>
        </div>

        {/* Code snippet */}
        {finding.codeSnippet && (
          <div className={`finding-detail-section${collapsed['code'] ? ' collapsed' : ''}`}>
            <div className="finding-detail-section-header" onClick={() => toggle('code')}>
              <span className="finding-detail-section-title">Code</span>
              <SectionToggle collapsed={!!collapsed['code']} />
            </div>
            <div className="finding-detail-section-content">
              <CodeWithLineNumbers
                code={finding.codeSnippet}
                startLine={finding.lineStart ?? 1}
              />
            </div>
          </div>
        )}

        {/* LLM analysis */}
        {finding.llmValidated && (
          <div className={`finding-detail-section${collapsed['llm'] ? ' collapsed' : ''}`}>
            <div className="finding-detail-section-header" onClick={() => toggle('llm')}>
              <span className="finding-detail-section-title">AI Analysis</span>
              <SectionToggle collapsed={!!collapsed['llm']} />
            </div>
            <div className="finding-detail-section-content">
              {finding.llmVerdict && (
                <span className={`finding-llm-verdict verdict-${finding.llmVerdict}`}>
                  {finding.llmVerdict === 'confirmed' && '⚠ Confirmed'}
                  {finding.llmVerdict === 'false_positive' && '✓ False positive'}
                  {finding.llmVerdict === 'needs_review' && '? Needs review'}
                </span>
              )}
              {finding.llmExplanation && (
                <p className="finding-llm-explanation">{finding.llmExplanation}</p>
              )}
            </div>
          </div>
        )}

        {/* Fix */}
        <div className={`finding-detail-section${collapsed['fix'] ? ' collapsed' : ''}`}>
          <div className="finding-detail-section-header" onClick={() => toggle('fix')}>
            <span className="finding-detail-section-title">Fix</span>
            <SectionToggle collapsed={!!collapsed['fix']} />
          </div>
          <div className="finding-detail-section-content">
            {!finding.fixAvailable && !finding.fixCode && (
              <div className="finding-fix-actions">
                <button
                  className="finding-generate-fix-btn"
                  onClick={handleGenerateFix}
                  disabled={fixLoading}
                >
                  {fixLoading ? (
                    <>
                      <span className="finding-spinner" />
                      Generating…
                    </>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
                      </svg>
                      Generate Fix
                    </>
                  )}
                </button>
              </div>
            )}

            {finding.fixCode && (
              <div className="finding-fix-diff">
                <span className="finding-fix-label">Suggested fix</span>
                <pre className="finding-fix-code">{finding.fixCode}</pre>

                {finding.fixExplanation && (
                  <div className="finding-fix-explanation">
                    {finding.fixExplanation}
                  </div>
                )}

                <div className="finding-fix-actions">
                  <button
                    className="finding-apply-fix-btn"
                    onClick={handleApplyFix}
                    disabled={applyLoading || finding.status === 'fixed'}
                  >
                    {applyLoading ? (
                      <>
                        <span className="finding-spinner" />
                        Applying…
                      </>
                    ) : finding.status === 'fixed' ? (
                      'Applied'
                    ) : (
                      'Apply Fix'
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Status controls */}
        <div className="finding-status-controls">
          <span className="finding-status-controls-label">Status</span>
          <select
            className="finding-status-select"
            value={finding.status}
            onChange={handleStatusChange}
          >
            <option value="open">Open</option>
            <option value="fixed">Fixed</option>
            <option value="ignored">Ignored</option>
            <option value="false_positive">False positive</option>
          </select>
        </div>
      </div>
    </div>
  );
}
