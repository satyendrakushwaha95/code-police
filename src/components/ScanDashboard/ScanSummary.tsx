import type { ScanSummary as ScanSummaryData } from '../../store/ScanContext';

interface ScanSummaryProps {
  summary: ScanSummaryData | null;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return `${minutes}m ${rem}s`;
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const date = d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const time = d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${date}, ${time}`;
}

export default function ScanSummary({ summary }: ScanSummaryProps) {
  if (!summary) {
    return (
      <div className="scan-summary">
        <div className="scan-summary-empty">No scan results yet</div>
      </div>
    );
  }

  const otherCount = Math.max(0, summary.totalFindings - summary.criticalCount - summary.highCount);

  return (
    <div className="scan-summary">
      <div className="scan-summary-header">
        <span className="scan-card-title" style={{ margin: 0 }}>
          {summary.profile}
        </span>
        <span className={`scan-summary-status ${summary.status}`}>
          {summary.status === 'complete' && (
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
          {summary.status === 'failed' && (
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          )}
          {summary.status}
        </span>
      </div>

      <div className="scan-summary-stats">
        <div className="scan-summary-stat">
          <span className="scan-summary-stat-value">{summary.totalFindings}</span>
          <span className="scan-summary-stat-label">Total</span>
        </div>
        <div className="scan-summary-stat">
          <span className="scan-summary-stat-value" style={{ color: 'var(--error)' }}>
            {summary.criticalCount}
          </span>
          <span className="scan-summary-stat-label">Critical</span>
        </div>
        <div className="scan-summary-stat">
          <span className="scan-summary-stat-value" style={{ color: 'var(--accent)' }}>
            {summary.highCount}
          </span>
          <span className="scan-summary-stat-label">High</span>
        </div>
        <div className="scan-summary-stat">
          <span className="scan-summary-stat-value">{otherCount}</span>
          <span className="scan-summary-stat-label">Other</span>
        </div>
      </div>

      <div className="scan-summary-meta">
        {summary.scanDuration != null && (
          <div className="scan-summary-meta-row">
            <span>Duration</span>
            <span>{formatDuration(summary.scanDuration)}</span>
          </div>
        )}
        {summary.healthScore != null && (
          <div className="scan-summary-meta-row">
            <span>Health Score</span>
            <span>{summary.healthScore} / 100</span>
          </div>
        )}
        <div className="scan-summary-meta-row">
          <span>Started</span>
          <span>{formatTimestamp(summary.startedAt)}</span>
        </div>
        {summary.completedAt != null && (
          <div className="scan-summary-meta-row">
            <span>Completed</span>
            <span>{formatTimestamp(summary.completedAt)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
