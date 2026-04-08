import type { ScanFinding } from '../../store/ScanContext';

interface FindingCardProps {
  finding: ScanFinding;
  isSelected: boolean;
  onSelect: () => void;
}

function formatLocation(finding: ScanFinding): string {
  const file = finding.filePath.split(/[/\\]/).pop() ?? finding.filePath;
  if (finding.lineStart != null) {
    return finding.lineEnd != null && finding.lineEnd !== finding.lineStart
      ? `${file}:${finding.lineStart}-${finding.lineEnd}`
      : `${file}:${finding.lineStart}`;
  }
  return file;
}

function snippetPreview(snippet: string | undefined): string | null {
  if (!snippet) return null;
  return snippet
    .split('\n')
    .filter(l => l.trim())
    .slice(0, 2)
    .join('\n');
}

export default function FindingCard({ finding, isSelected, onSelect }: FindingCardProps) {
  const preview = snippetPreview(finding.codeSnippet);

  return (
    <div
      className={`finding-card severity-${finding.severity}${isSelected ? ' selected' : ''}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="finding-card-header">
        <span className={`severity-badge sev-${finding.severity}`}>
          {finding.severity}
        </span>
        <div className="finding-card-title-block">
          <h4 className="finding-card-title">{finding.title}</h4>
          <p className="finding-card-file">{formatLocation(finding)}</p>
        </div>
      </div>

      {preview && (
        <pre className="finding-card-snippet">{preview}</pre>
      )}

      <div className="finding-card-meta">
        {finding.cweId && (
          <span className="meta-badge">{finding.cweId}</span>
        )}
        {finding.owaspCategory && (
          <span className="meta-badge">{finding.owaspCategory}</span>
        )}
        <span className={`meta-badge confidence-${finding.confidence}`}>
          {finding.confidence} confidence
        </span>
        {finding.llmValidated && (
          <span className="meta-badge">AI verified</span>
        )}
      </div>

      <div className="finding-card-actions">
        <span className={`status-badge status-${finding.status}`}>
          {finding.status === 'false_positive' ? 'False positive' : finding.status}
        </span>
        <div className="finding-card-actions-right">
          {finding.fixAvailable && (
            <span className="finding-view-fix-btn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
              </svg>
              Fix available
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
