import { useState, useMemo, useCallback } from 'react';
import { useScanContext } from '../../store/ScanContext';
import type { ScanFinding } from '../../store/ScanContext';
import FindingCard from './FindingCard';
import FindingDetail from './FindingDetail';
import FindingFilters from './FindingFilters';
import './FindingsExplorer.css';

const ipc = (window as any).ipcRenderer;

export interface FilterState {
  severity: string[];
  category: string[];
  status: string[];
  search: string;
}

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

function matchesSearch(finding: ScanFinding, term: string): boolean {
  const lower = term.toLowerCase();
  return (
    finding.title.toLowerCase().includes(lower) ||
    finding.filePath.toLowerCase().includes(lower) ||
    (finding.description ?? '').toLowerCase().includes(lower) ||
    (finding.cweId ?? '').toLowerCase().includes(lower)
  );
}

export default function FindingsExplorer() {
  const { state } = useScanContext();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    severity: [],
    category: [],
    status: [],
    search: '',
  });

  const filtered = useMemo(() => {
    let results = state.findings;

    if (filters.severity.length > 0) {
      results = results.filter(f => filters.severity.includes(f.severity));
    }
    if (filters.category.length > 0) {
      results = results.filter(f => filters.category.includes(f.category));
    }
    if (filters.status.length > 0) {
      results = results.filter(f => filters.status.includes(f.status));
    }
    if (filters.search.trim()) {
      results = results.filter(f => matchesSearch(f, filters.search.trim()));
    }

    return results.slice().sort(
      (a, b) => (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99)
    );
  }, [state.findings, filters]);

  const selectedFinding = useMemo(
    () => (selectedId ? filtered.find(f => f.id === selectedId) ?? null : null),
    [selectedId, filtered]
  );

  const handleExportJson = useCallback(async () => {
    if (!state.activeScanId || !ipc) return;
    try {
      const dialogResult = await ipc.invoke('dialog:showSaveDialog', {
        title: 'Export Findings',
        defaultPath: `findings-${state.activeScanId.slice(0, 8)}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (dialogResult?.canceled || !dialogResult?.filePath) return;
      await ipc.invoke('scan:generateReport', {
        scanId: state.activeScanId,
        format: 'json',
        includeFixSuggestions: true,
        includeLlmExplanations: true,
        outputPath: dialogResult.filePath,
      });
    } catch { /* ignore */ }
  }, [state.activeScanId]);

  return (
    <div className="findings-explorer">
      <div className="findings-header">
        <div className="findings-header-left">
          <h2 className="findings-header-title">Findings</h2>
          <span className="findings-header-count">{state.findings.length}</span>
        </div>
        <div className="findings-header-actions">
          <button className="findings-export-btn" title="Export findings" onClick={handleExportJson} disabled={!state.activeScanId}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export
          </button>
        </div>
      </div>

      <FindingFilters
        filters={filters}
        onChange={setFilters}
        totalCount={state.findings.length}
        filteredCount={filtered.length}
      />

      <div className="findings-body">
        <div className="findings-list">
          {state.isScanning ? (
            <div className="findings-empty">
              <span className="findings-empty-icon" style={{ animation: 'pulse 1.5s ease-in-out infinite' }}>🔄</span>
              <h3 className="findings-empty-title">Scan in progress...</h3>
              <p className="findings-empty-desc">Findings will appear here as they are discovered.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="findings-empty">
              <span className="findings-empty-icon">
                {state.findings.length === 0 ? '🛡️' : '🔍'}
              </span>
              <h3 className="findings-empty-title">
                {state.findings.length === 0
                  ? 'No findings yet'
                  : 'No findings match filters'}
              </h3>
              <p className="findings-empty-desc">
                {state.findings.length === 0
                  ? 'Run a security scan to discover potential issues in your codebase.'
                  : 'Try adjusting your filters or search query to see more results.'}
              </p>
            </div>
          ) : (
            filtered.map(finding => (
              <FindingCard
                key={finding.id}
                finding={finding}
                isSelected={finding.id === selectedId}
                onSelect={() =>
                  setSelectedId(prev => (prev === finding.id ? null : finding.id))
                }
              />
            ))
          )}
        </div>

        {selectedFinding && (
          <FindingDetail
            finding={selectedFinding}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    </div>
  );
}
