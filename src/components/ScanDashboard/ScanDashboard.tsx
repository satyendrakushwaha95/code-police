import { useEffect } from 'react';
import { useScanContext } from '../../store/ScanContext';
import { useWorkspace } from '../../store/WorkspaceContext';
import HealthScore from './HealthScore';
import SeverityChart from './SeverityChart';
import ScanControls from './ScanControls';
import ScanSummary from './ScanSummary';
import './ScanDashboard.css';

const phaseLabels: Record<string, string> = {
  initializing: 'Initializing',
  analyzing_project: 'Analyzing Project',
  discovering_files: 'Discovering Files',
  scanning_rules: 'Scanning Rules',
  auditing_dependencies: 'Auditing Dependencies',
  auditing_config: 'Auditing Configuration',
  indexing_vectors: 'Indexing Vectors',
  llm_analysis: 'LLM Analysis',
  aggregating: 'Aggregating Results',
  generating_summary: 'Generating Summary',
  complete: 'Complete',
};

function formatPhase(phase: string): string {
  return phaseLabels[phase] || phase;
}

export default function ScanDashboard() {
  const { state, loadProfiles, loadHistory, loadTrend, loadFindings, stopScan } = useScanContext();
  const { state: workspace, openFolder } = useWorkspace();

  const { isScanning, progress, lastScanSummary, findings, liveFindings, trend } = state;
  const rootPath = workspace.rootPath;
  const projectName = workspace.folderName;

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  useEffect(() => {
    if (rootPath) {
      loadHistory(rootPath);
      loadTrend(rootPath);
    }
  }, [rootPath, loadHistory, loadTrend]);

  useEffect(() => {
    if (!isScanning && lastScanSummary?.id) {
      loadFindings(lastScanSummary.id);
    }
  }, [isScanning, lastScanSummary?.id, loadFindings]);

  const progressPct = progress
    ? progress.totalFiles > 0
      ? Math.round((progress.filesScanned / progress.totalFiles) * 100)
      : 0
    : 0;

  const currentScore = lastScanSummary?.healthScore ?? 0;
  const previousScore = trend.length >= 2
    ? trend[trend.length - 2].healthScore
    : undefined;

  if (!rootPath) {
    return (
      <div className="scan-dashboard">
        <div className="scan-no-project">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
          <h3>No Project Open</h3>
          <p>Open a project folder to begin scanning for security vulnerabilities.</p>
          <button className="scan-open-btn" onClick={openFolder}>
            Open Project
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="scan-dashboard">
      <div className="scan-dashboard-header">
        <div className="scan-dashboard-header-left">
          <h2>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            Security Scanner
          </h2>
          <span className="scan-project-name">{projectName}</span>
        </div>
        <div className={`scan-status-badge ${isScanning ? 'scanning' : 'idle'}`}>
          {isScanning && <span className="scan-pulse" />}
          {isScanning ? 'Scanning' : 'Idle'}
        </div>
      </div>

      {isScanning && (
        <div className="scan-progress-section">
          <div className="scan-phase-label">
            {formatPhase(progress?.phase ?? 'initializing')}
          </div>
          <div className="scan-progress-bar">
            <div className="scan-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
          <div className="scan-progress-meta">
            <span>{progress?.filesScanned ?? 0} / {progress?.totalFiles ?? 0} files</span>
            <span className="scan-elapsed">
              {progress?.elapsedMs ? `${Math.floor(progress.elapsedMs / 1000)}s elapsed` : ''}
            </span>
            <span className="scan-live-counter">
              {liveFindings.length} finding{liveFindings.length !== 1 ? 's' : ''} detected
            </span>
          </div>
          <button className="scan-stop-btn" onClick={stopScan}>
            Stop Scan
          </button>
        </div>
      )}

      {!isScanning && lastScanSummary && (
        <div className="scan-dashboard-grid">
          <div className="scan-card">
            <div className="scan-card-title">Health Score</div>
            <HealthScore score={currentScore} previousScore={previousScore} />
          </div>
          <div className="scan-card">
            <div className="scan-card-title">Severity Breakdown</div>
            <SeverityChart findings={findings} />
          </div>
          <div className="scan-card">
            <div className="scan-card-title">Scan Controls</div>
            <ScanControls />
          </div>
          <div className="scan-card">
            <div className="scan-card-title">Last Scan</div>
            <ScanSummary summary={lastScanSummary} />
          </div>
        </div>
      )}

      {!isScanning && !lastScanSummary && (
        <div className="scan-empty-state">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <h3>Ready to Scan</h3>
          <p>Run your first security scan to identify vulnerabilities, dependency issues, and configuration problems.</p>
          <ScanControls />
        </div>
      )}
    </div>
  );
}
