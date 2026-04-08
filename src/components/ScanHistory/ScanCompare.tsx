import { useCallback, useEffect, useState } from 'react';
import type { ScanFinding, ScanSummary } from '../../store/ScanContext';
import './ScanHistory.css';

const ipcRenderer = (typeof window !== 'undefined' && (window as any).ipcRenderer) as
  | { invoke(channel: string, ...args: unknown[]): Promise<unknown> }
  | undefined;

export interface ScanComparisonPayload {
  scanA: ScanSummary;
  scanB: ScanSummary;
  newFindings: ScanFinding[];
  resolvedFindings: ScanFinding[];
  unchangedCount: number;
  healthScoreDelta: number;
}

export interface ScanCompareProps {
  scanIdA: string;
  scanIdB: string;
  onClose: () => void;
}

function formatScanWhen(ts: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(ts));
  } catch {
    return new Date(ts).toLocaleString();
  }
}

function formatHealth(h?: number): string {
  if (h == null || !Number.isFinite(h)) return '—';
  return String(Math.round(h));
}

export default function ScanCompare({ scanIdA, scanIdB, onClose }: ScanCompareProps) {
  const [data, setData] = useState<ScanComparisonPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ipcRenderer) {
      setError('Comparison is only available in the desktop app.');
      setLoading(false);
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const raw = await ipcRenderer.invoke('scan:compareScan', { scanIdA, scanIdB });
      if (raw == null) {
        setData(null);
        setError('Could not load one or both scans for comparison.');
        return;
      }
      setData(raw as ScanComparisonPayload);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Comparison failed.';
      setError(msg);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [scanIdA, scanIdB]);

  useEffect(() => {
    void load();
  }, [load]);

  const deltaBanner = () => {
    if (!data) return null;
    const d = data.healthScoreDelta;
    const better = d > 0;
    const worse = d < 0;
    const cls = better ? 'better' : worse ? 'worse' : 'same';
    const arrow = better ? '↑' : worse ? '↓' : '→';
    const label = better ? 'Health improved' : worse ? 'Health declined' : 'No health change';
    const signed = d > 0 ? `+${d}` : String(d);
    return (
      <div className={`scan-compare-delta-banner ${cls}`} role="status">
        <span className="scan-compare-delta-arrow" aria-hidden>
          {arrow}
        </span>
        <span>
          {label}: {signed} pts (B vs A)
        </span>
      </div>
    );
  };

  return (
    <div className="scan-compare">
      <header className="scan-compare-header">
        <h2 className="scan-compare-title">Compare scans</h2>
        <button type="button" className="scan-compare-close" onClick={onClose}>
          Close
        </button>
      </header>
      <div className="scan-compare-body">
        {loading && <div className="scan-compare-loading">Loading comparison…</div>}
        {!loading && error && <div className="scan-compare-error">{error}</div>}
        {!loading && !error && data && (
          <>
            {deltaBanner()}
            <div className="scan-compare-metrics">
              <div className="scan-compare-metric-card">
                <span className="scan-compare-metric-label">New findings</span>
                <span className="scan-compare-metric-value new">{data.newFindings.length}</span>
              </div>
              <div className="scan-compare-metric-card">
                <span className="scan-compare-metric-label">Resolved</span>
                <span className="scan-compare-metric-value muted">
                  {data.resolvedFindings.length}
                </span>
              </div>
              <div className="scan-compare-metric-card">
                <span className="scan-compare-metric-label">Unchanged</span>
                <span className="scan-compare-metric-value">{data.unchangedCount}</span>
              </div>
              <div className="scan-compare-metric-card">
                <span className="scan-compare-metric-label">Health Δ (B − A)</span>
                <span className="scan-compare-metric-value">
                  {data.healthScoreDelta > 0 ? '+' : ''}
                  {data.healthScoreDelta}
                </span>
              </div>
            </div>
            <div className="scan-compare-scans-row">
              <div className="scan-compare-scan-card">
                <div className="scan-compare-scan-label">Baseline (A)</div>
                <dl>
                  <dt>When</dt>
                  <dd>{formatScanWhen(data.scanA.startedAt)}</dd>
                  <dt>Profile</dt>
                  <dd>{data.scanA.profile}</dd>
                  <dt>Health</dt>
                  <dd>{formatHealth(data.scanA.healthScore)}</dd>
                  <dt>Findings</dt>
                  <dd>{data.scanA.totalFindings}</dd>
                </dl>
              </div>
              <div className="scan-compare-scan-card">
                <div className="scan-compare-scan-label">Compared (B)</div>
                <dl>
                  <dt>When</dt>
                  <dd>{formatScanWhen(data.scanB.startedAt)}</dd>
                  <dt>Profile</dt>
                  <dd>{data.scanB.profile}</dd>
                  <dt>Health</dt>
                  <dd>{formatHealth(data.scanB.healthScore)}</dd>
                  <dt>Findings</dt>
                  <dd>{data.scanB.totalFindings}</dd>
                </dl>
              </div>
            </div>
            <div className="scan-compare-findings">
              <div className="scan-compare-findings-column new">
                <h3>New in B ({data.newFindings.length})</h3>
                {data.newFindings.length === 0 ? (
                  <p className="scan-compare-findings-empty">No new findings.</p>
                ) : (
                  <ul className="scan-compare-findings-list">
                    {data.newFindings.map(f => (
                      <li key={f.id} className="scan-compare-finding new">
                        <span className="scan-compare-finding-title">{f.title}</span>
                        <span className="scan-compare-finding-meta">
                          {f.severity} · {f.filePath}
                          {f.lineStart != null ? `:${f.lineStart}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="scan-compare-findings-column resolved">
                <h3>Resolved since A ({data.resolvedFindings.length})</h3>
                {data.resolvedFindings.length === 0 ? (
                  <p className="scan-compare-findings-empty">No resolved findings.</p>
                ) : (
                  <ul className="scan-compare-findings-list">
                    {data.resolvedFindings.map(f => (
                      <li key={f.id} className="scan-compare-finding resolved">
                        <span className="scan-compare-finding-title">{f.title}</span>
                        <span className="scan-compare-finding-meta">
                          {f.severity} · {f.filePath}
                          {f.lineStart != null ? `:${f.lineStart}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
