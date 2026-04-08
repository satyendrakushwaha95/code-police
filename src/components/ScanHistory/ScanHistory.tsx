import { useCallback, useMemo, type MouseEvent } from 'react';
import { useScanContext, type ScanSummary } from '../../store/ScanContext';
import './ScanHistory.css';

export interface ScanHistoryProps {
  onSelectScan?: (scanId: string) => void;
}

function formatScanDate(ts: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(ts));
  } catch {
    return new Date(ts).toLocaleString();
  }
}

function formatDuration(ms: number | undefined): string {
  if (ms == null || ms < 0 || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  if (min < 60) return rem ? `${min}m ${rem}s` : `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function statusClass(status: ScanSummary['status']): string {
  switch (status) {
    case 'running':
      return 'running';
    case 'complete':
      return 'complete';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'complete';
  }
}

export default function ScanHistory({ onSelectScan }: ScanHistoryProps) {
  const { state, selectScan, deleteScan } = useScanContext();

  const sorted = useMemo(
    () => [...state.history].sort((a, b) => b.startedAt - a.startedAt),
    [state.history],
  );

  const handleSelect = useCallback(
    async (scanId: string) => {
      await selectScan(scanId);
      onSelectScan?.(scanId);
    },
    [selectScan, onSelectScan],
  );

  const handleDelete = useCallback(
    async (e: MouseEvent, scanId: string) => {
      e.stopPropagation();
      e.preventDefault();
      if (!confirm('Delete this scan and its findings from history?')) return;
      try {
        await deleteScan(scanId);
      } catch (err) {
        console.error('deleteScan failed', err);
      }
    },
    [deleteScan],
  );

  const filesLabelFor = useCallback(
    (scanId: string): string => {
      if (state.activeScanId === scanId && state.progress) {
        const { filesScanned, totalFiles } = state.progress;
        if (totalFiles > 0) return `${filesScanned} / ${totalFiles}`;
        return String(filesScanned);
      }
      return '—';
    },
    [state.activeScanId, state.progress],
  );

  if (sorted.length === 0) {
    return (
      <div className="scan-history">
        <div className="scan-history-header">
          <h2 className="scan-history-title">Scan history</h2>
          <span className="scan-history-count">0 scans</span>
        </div>
        <div className="scan-history-empty" role="status">
          <p className="scan-history-empty-title">No scans yet</p>
          <p className="scan-history-empty-hint">
            Run a security scan on this project to build history here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="scan-history">
      <div className="scan-history-header">
        <h2 className="scan-history-title">Scan history</h2>
        <span className="scan-history-count" aria-live="polite">
          {sorted.length} scan{sorted.length === 1 ? '' : 's'}
        </span>
      </div>
      <ul className="scan-history-list">
        {sorted.map(scan => {
          const durationMs =
            scan.scanDuration ??
            (scan.completedAt != null ? scan.completedAt - scan.startedAt : undefined);
          const active = state.activeScanId === scan.id;
          return (
            <li key={scan.id} className="scan-history-item-wrap">
              <div
                className={`scan-history-item${active ? ' active' : ''}`}
                tabIndex={0}
                aria-current={active ? 'true' : undefined}
                role="button"
                aria-label={`Scan ${formatScanDate(scan.startedAt)}, ${scan.profile}, select`}
                onClick={() => void handleSelect(scan.id)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    void handleSelect(scan.id);
                  }
                }}
              >
              <div className="scan-history-item-actions">
                <button
                  type="button"
                  className="scan-history-delete"
                  title="Delete scan"
                  aria-label={`Delete scan from ${formatScanDate(scan.startedAt)}`}
                  onClick={e => void handleDelete(e, scan.id)}
                >
                  ×
                </button>
              </div>
              <div className="scan-history-item-header">
                <span className="scan-history-item-date">{formatScanDate(scan.startedAt)}</span>
                <span className="scan-history-profile-badge">{scan.profile}</span>
                <span className={`scan-history-item-status ${statusClass(scan.status)}`}>
                  {scan.status}
                </span>
              </div>
              <div className="scan-history-item-stats">
                <span className="scan-history-health">
                  <span className="scan-history-health-label">Health</span>{' '}
                  {scan.healthScore != null ? `${Math.round(scan.healthScore)}` : '—'}
                </span>
                <span className="scan-history-counts">
                  <span>{scan.totalFindings} total</span>
                  <span className="scan-history-sev-critical">{scan.criticalCount} crit</span>
                  <span className="scan-history-sev-high">{scan.highCount} high</span>
                </span>
              </div>
              <div className="scan-history-item-meta">
                <span title="Scan duration">Duration: {formatDuration(durationMs)}</span>
                <span title="Files scanned (live progress when scan is active)">
                  Files: {filesLabelFor(scan.id)}
                </span>
              </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
