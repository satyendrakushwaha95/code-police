import { useMemo } from 'react';
import { useScanContext } from '../../store/ScanContext';
import type { ScanFinding } from '../../store/ScanContext';
import TrendChart from './TrendChart';
import ExportControls from './ExportControls';
import './ReportView.css';

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info'] as const;

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  return `${mins}m ${remSecs}s`;
}

function groupBySeverity(findings: ScanFinding[]) {
  const groups: Record<string, ScanFinding[]> = {};
  for (const sev of SEVERITY_ORDER) groups[sev] = [];
  for (const f of findings) {
    if (groups[f.severity]) groups[f.severity].push(f);
  }
  return groups;
}

function groupByCategory(findings: ScanFinding[]) {
  const cats: Record<string, number> = {};
  for (const f of findings) {
    cats[f.category] = (cats[f.category] || 0) + 1;
  }
  return Object.entries(cats).sort((a, b) => b[1] - a[1]);
}

export default function ReportView() {
  const { state } = useScanContext();
  const { findings, lastScanSummary: summary, trend } = state;

  const severityGroups = useMemo(() => groupBySeverity(findings), [findings]);
  const categoryCounts = useMemo(() => groupByCategory(findings), [findings]);

  const severityCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const sev of SEVERITY_ORDER) counts[sev] = severityGroups[sev].length;
    return counts;
  }, [severityGroups]);

  const maxSeverityCount = useMemo(
    () => Math.max(1, ...Object.values(severityCounts)),
    [severityCounts],
  );

  const dependencyFindings = useMemo(
    () => findings.filter(f => f.category === 'dependency'),
    [findings],
  );

  if (!summary) {
    return (
      <div className="report-view">
        <div className="report-empty">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9 17H5a2 2 0 01-2-2V5a2 2 0 012-2h4m6 14h4a2 2 0 002-2V5a2 2 0 00-2-2h-4m-6 0v18m6-18v18" />
          </svg>
          <h3 className="report-empty-title">No Report Available</h3>
          <p className="report-empty-desc">
            Run a security scan first to generate a report. The report will include findings, metrics, and trend data.
          </p>
        </div>
      </div>
    );
  }

  const scanDate = summary.startedAt ? formatDate(summary.startedAt) : 'Unknown';
  const duration = summary.scanDuration ? formatDuration(summary.scanDuration) : '—';
  const projectName = summary.projectName || summary.projectRoot.split(/[/\\]/).pop() || 'Project';
  const healthScore = summary.healthScore ?? 0;

  return (
    <div className="report-view">
      <div className="report-document">
        {/* ── Header ──────────────────────────────────────────────── */}
        <header className="report-header">
          <h1 className="report-header-title">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            Security Scan Report
          </h1>
          <span className="report-header-project">{projectName}</span>
          <div className="report-header-meta">
            <span className="report-header-meta-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M16 2v4M8 2v4M3 10h18" />
              </svg>
              {scanDate}
            </span>
            <span className="report-header-meta-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              Duration: <strong>{duration}</strong>
            </span>
            <span className="report-header-meta-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                <line x1="4" y1="22" x2="4" y2="15" />
              </svg>
              Profile: <strong>{summary.profile}</strong>
            </span>
            <span className="report-header-meta-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              Scan ID: <strong>{summary.id.slice(0, 8)}</strong>
            </span>
          </div>
        </header>

        {/* ── Executive Summary ────────────────────────────────────── */}
        <section className="report-executive-summary">
          <h2 className="report-section-title">Executive Summary</h2>
          <p className="report-executive-summary-text">
            This scan analyzed the <strong>{projectName}</strong> project and identified{' '}
            <strong>{findings.length}</strong> finding{findings.length !== 1 ? 's' : ''} across{' '}
            {categoryCounts.length} categor{categoryCounts.length !== 1 ? 'ies' : 'y'}.
            {summary.criticalCount > 0 && (
              <> There {summary.criticalCount === 1 ? 'is' : 'are'}{' '}
              <strong>{summary.criticalCount} critical</strong> issue{summary.criticalCount !== 1 ? 's' : ''}{' '}
              requiring immediate attention.</>
            )}
            {summary.highCount > 0 && (
              <> Additionally, <strong>{summary.highCount} high</strong>-severity finding{summary.highCount !== 1 ? 's were' : ' was'} detected.</>
            )}
            {summary.criticalCount === 0 && summary.highCount === 0 && (
              <> No critical or high-severity issues were found.</>
            )}
            {' '}The overall health score is <strong>{healthScore}/100</strong>.
          </p>
          <div className="report-executive-summary-stats">
            <div className="report-summary-stat">
              <span className="report-summary-stat-value score">{healthScore}</span>
              <span className="report-summary-stat-label">Health Score</span>
            </div>
            <div className="report-summary-stat">
              <span className="report-summary-stat-value critical">{summary.criticalCount}</span>
              <span className="report-summary-stat-label">Critical</span>
            </div>
            <div className="report-summary-stat">
              <span className="report-summary-stat-value high">{summary.highCount}</span>
              <span className="report-summary-stat-label">High</span>
            </div>
            <div className="report-summary-stat">
              <span className="report-summary-stat-value total">{findings.length}</span>
              <span className="report-summary-stat-label">Total</span>
            </div>
          </div>
        </section>

        {/* ── Metrics Grid ────────────────────────────────────────── */}
        <div className="report-metrics-grid">
          <div className="report-metrics-card">
            <h3 className="report-metrics-card-title">Severity Breakdown</h3>
            <div className="report-severity-bars">
              {SEVERITY_ORDER.map(sev => (
                <div className="report-severity-row" key={sev}>
                  <span className="report-severity-label">{sev}</span>
                  <div className="report-severity-bar-track">
                    <div
                      className={`report-severity-bar-fill sev-${sev}`}
                      style={{ width: `${(severityCounts[sev] / maxSeverityCount) * 100}%` }}
                    />
                  </div>
                  <span className="report-severity-count">{severityCounts[sev]}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="report-metrics-card">
            <h3 className="report-metrics-card-title">Category Breakdown</h3>
            <div className="report-category-list">
              {categoryCounts.length === 0 && (
                <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No findings</span>
              )}
              {categoryCounts.map(([cat, count]) => (
                <div className="report-category-row" key={cat}>
                  <span className="report-category-name">{cat}</span>
                  <span className="report-category-count">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Trend Chart ─────────────────────────────────────────── */}
        <section className="report-trend-section">
          <h2 className="report-section-title">Health Score Trend</h2>
          <TrendChart data={trend} />
        </section>

        {/* ── Findings by Severity ────────────────────────────────── */}
        <section className="report-findings-section">
          <h2 className="report-section-title">Findings Detail</h2>
          {SEVERITY_ORDER.map(sev => {
            const items = severityGroups[sev];
            if (items.length === 0) return null;
            return (
              <div className="report-findings-group" key={sev}>
                <div className="report-findings-group-header">
                  <span className={`report-findings-group-dot sev-${sev}`} />
                  <span className="report-findings-group-label">{sev}</span>
                  <span className="report-findings-group-count">({items.length})</span>
                </div>
                {items.map(f => (
                  <div className={`report-finding-item sev-${f.severity}`} key={f.id}>
                    <h4 className="report-finding-title">{f.title}</h4>
                    <p className="report-finding-description">{f.description}</p>
                    <div className="report-finding-meta">
                      <span className="report-finding-file">
                        {f.filePath}{f.lineStart != null ? `:${f.lineStart}` : ''}
                      </span>
                      {f.cweId && <span className="report-finding-badge">{f.cweId}</span>}
                      {f.owaspCategory && <span className="report-finding-badge">{f.owaspCategory}</span>}
                      <span className="report-finding-badge">{f.category}</span>
                    </div>
                    {f.codeSnippet && (
                      <pre className="report-finding-code">{f.codeSnippet}</pre>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
          {findings.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)', textAlign: 'center', padding: '24px 0' }}>
              No findings to display.
            </p>
          )}
        </section>

        {/* ── Dependency Audit Table ──────────────────────────────── */}
        {dependencyFindings.length > 0 && (
          <section className="report-dependency-section">
            <h2 className="report-section-title">Dependency Audit</h2>
            <table className="report-dependency-table">
              <thead>
                <tr>
                  <th>Severity</th>
                  <th>Title</th>
                  <th>File</th>
                  <th>CWE</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {dependencyFindings.map(dep => (
                  <tr key={dep.id}>
                    <td>
                      <span className={`report-dep-severity sev-${dep.severity}`}>
                        {dep.severity}
                      </span>
                    </td>
                    <td className="report-dep-pkg">{dep.title}</td>
                    <td className="report-dep-version">{dep.filePath}</td>
                    <td className="report-dep-cve">{dep.cweId || '—'}</td>
                    <td>{dep.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>

      {/* ── Export Bar ─────────────────────────────────────────── */}
      <div className="report-export-bar">
        <ExportControls scanId={summary.id} />
      </div>
    </div>
  );
}
