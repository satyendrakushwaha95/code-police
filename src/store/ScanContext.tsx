import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

export interface ScanFinding {
  id: string;
  scanId: string;
  ruleId: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: string;
  type: string;
  title: string;
  description: string;
  filePath: string;
  lineStart?: number;
  lineEnd?: number;
  columnStart?: number;
  codeSnippet?: string;
  cweId?: string;
  owaspCategory?: string;
  confidence: string;
  llmValidated: boolean;
  llmVerdict?: string;
  llmExplanation?: string;
  fixAvailable: boolean;
  fixCode?: string;
  fixExplanation?: string;
  status: 'open' | 'fixed' | 'ignored' | 'false_positive';
  createdAt: number;
}

export interface ScanSummary {
  id: string;
  projectRoot: string;
  projectName?: string;
  profile: string;
  status: 'running' | 'complete' | 'failed' | 'cancelled';
  healthScore?: number;
  totalFindings: number;
  criticalCount: number;
  highCount: number;
  startedAt: number;
  completedAt?: number;
  scanDuration?: number;
}

export interface ScanProgress {
  scanId: string;
  phase: string;
  filesScanned: number;
  totalFiles: number;
  currentFile?: string;
  findingsCount: number;
  elapsedMs: number;
  message?: string;
}

export interface ScanProfile {
  id: string;
  name: string;
  description: string;
  icon: string;
  enableLlmReview: boolean;
  enableDependencyAudit: boolean;
  enableConfigAudit: boolean;
}

export interface TrendDataPoint {
  scanId: string;
  healthScore: number;
  totalFindings: number;
  criticalCount: number;
  highCount: number;
  timestamp: number;
}

interface ScanState {
  activeScanId: string | null;
  isScanning: boolean;
  progress: ScanProgress | null;
  lastScanSummary: ScanSummary | null;
  findings: ScanFinding[];
  liveFindings: ScanFinding[];
  history: ScanSummary[];
  profiles: ScanProfile[];
  trend: TrendDataPoint[];
  error: string | null;
}

interface ScanContextType {
  state: ScanState;
  startScan: (projectRoot: string, profile: string, enableLlm: boolean) => Promise<void>;
  stopScan: () => void;
  loadHistory: (projectRoot: string) => Promise<void>;
  loadFindings: (scanId: string, filters?: any) => Promise<void>;
  loadTrend: (projectRoot: string) => Promise<void>;
  loadProfiles: () => Promise<void>;
  updateFindingStatus: (findingId: string, status: string) => Promise<void>;
  generateFix: (findingId: string) => Promise<any>;
  applyFix: (findingId: string) => Promise<any>;
  selectScan: (scanId: string) => Promise<void>;
  deleteScan: (scanId: string) => Promise<void>;
}

const ScanContext = createContext<ScanContextType | undefined>(undefined);

export function ScanProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ScanState>({
    activeScanId: null,
    isScanning: false,
    progress: null,
    lastScanSummary: null,
    findings: [],
    liveFindings: [],
    history: [],
    profiles: [],
    trend: [],
    error: null,
  });

  const ipc = (window as any).ipcRenderer;
  const liveFindingsRef = useRef<ScanFinding[]>([]);

  useEffect(() => {
    if (!ipc) return;

    const onProgress = (_: any, progress: ScanProgress) => {
      setState(prev => ({ ...prev, progress }));
    };

    const onFinding = (_: any, data: { scanId: string; finding: ScanFinding }) => {
      liveFindingsRef.current = [...liveFindingsRef.current, data.finding];
      setState(prev => ({ ...prev, liveFindings: liveFindingsRef.current }));
    };

    const onComplete = (_: any, data: { scanId: string; summary: ScanSummary }) => {
      setState(prev => ({
        ...prev,
        isScanning: false,
        lastScanSummary: data.summary,
        progress: null,
        liveFindings: [],
      }));
      liveFindingsRef.current = [];
    };

    const onError = (_: any, data: { scanId: string; error: string }) => {
      setState(prev => ({
        ...prev,
        isScanning: false,
        error: data.error,
        progress: null,
      }));
    };

    ipc.on('scan:progress', onProgress);
    ipc.on('scan:finding', onFinding);
    ipc.on('scan:complete', onComplete);
    ipc.on('scan:error', onError);

    return () => {
      ipc.off('scan:progress', onProgress);
      ipc.off('scan:finding', onFinding);
      ipc.off('scan:complete', onComplete);
      ipc.off('scan:error', onError);
    };
  }, [ipc]);

  const startScan = useCallback(async (projectRoot: string, profile: string, enableLlm: boolean) => {
    if (!ipc) return;
    liveFindingsRef.current = [];
    setState(prev => ({
      ...prev, isScanning: true, error: null, progress: null,
      liveFindings: [], findings: [], activeScanId: null,
    }));
    try {
      const config = {
        projectRoot,
        profile,
        enableLlmReview: enableLlm,
        enableDependencyAudit: true,
        enableConfigAudit: true,
      };
      const { scanId } = await ipc.invoke('scan:start', config);
      setState(prev => ({ ...prev, activeScanId: scanId }));
    } catch (err: any) {
      setState(prev => ({ ...prev, isScanning: false, error: err.message }));
    }
  }, [ipc]);

  const stopScan = useCallback(() => {
    if (!ipc || !state.activeScanId) return;
    ipc.invoke('scan:stop', state.activeScanId);
    setState(prev => ({ ...prev, isScanning: false, progress: null }));
  }, [ipc, state.activeScanId]);

  const loadHistory = useCallback(async (projectRoot: string) => {
    if (!ipc) return;
    try {
      const history = await ipc.invoke('scan:getHistory', { projectRoot, limit: 50 });
      setState(prev => ({ ...prev, history: history || [] }));
    } catch { /* ignore */ }
  }, [ipc]);

  const loadFindings = useCallback(async (scanId: string, filters?: any) => {
    if (!ipc) return;
    try {
      const findings = await ipc.invoke('scan:getFindings', { scanId, filters });
      setState(prev => ({ ...prev, findings: findings || [], activeScanId: scanId }));
    } catch { /* ignore */ }
  }, [ipc]);

  const loadTrend = useCallback(async (projectRoot: string) => {
    if (!ipc) return;
    try {
      const trend = await ipc.invoke('scan:getReportTrend', { projectRoot, limit: 10 });
      setState(prev => ({ ...prev, trend: trend || [] }));
    } catch { /* ignore */ }
  }, [ipc]);

  const loadProfiles = useCallback(async () => {
    if (!ipc) return;
    try {
      const profiles = await ipc.invoke('scan:getProfiles');
      setState(prev => ({ ...prev, profiles: profiles || [] }));
    } catch { /* ignore */ }
  }, [ipc]);

  const updateFindingStatus = useCallback(async (findingId: string, status: string) => {
    if (!ipc) return;
    await ipc.invoke('scan:updateFinding', { findingId, status });
    setState(prev => ({
      ...prev,
      findings: prev.findings.map(f => f.id === findingId ? { ...f, status: status as any } : f),
    }));
  }, [ipc]);

  const generateFix = useCallback(async (findingId: string) => {
    if (!ipc) return null;
    const fix = await ipc.invoke('scan:generateFix', findingId);
    setState(prev => ({
      ...prev,
      findings: prev.findings.map(f => f.id === findingId ? { ...f, fixAvailable: true, fixCode: fix.fixedCode, fixExplanation: fix.explanation } : f),
    }));
    return fix;
  }, [ipc]);

  const applyFix = useCallback(async (findingId: string) => {
    if (!ipc) return null;
    const result = await ipc.invoke('scan:applyFix', findingId);
    if (result.success) {
      setState(prev => ({
        ...prev,
        findings: prev.findings.map(f => f.id === findingId ? { ...f, status: 'fixed' as const } : f),
      }));
    }
    return result;
  }, [ipc]);

  const selectScan = useCallback(async (scanId: string) => {
    if (!ipc) return;
    const results = await ipc.invoke('scan:getResults', scanId);
    if (results) {
      setState(prev => ({
        ...prev,
        activeScanId: scanId,
        findings: results.findings || [],
        lastScanSummary: {
          id: results.scan.id,
          projectRoot: results.scan.projectRoot,
          projectName: results.scan.projectName,
          profile: results.scan.profile,
          status: results.scan.status,
          healthScore: results.scan.healthScore,
          totalFindings: results.findings?.length || 0,
          criticalCount: results.metrics?.criticalCount || 0,
          highCount: results.metrics?.highCount || 0,
          startedAt: results.scan.startedAt,
          completedAt: results.scan.completedAt,
        },
      }));
    }
  }, [ipc]);

  const deleteScan = useCallback(async (scanId: string) => {
    if (!ipc) return;
    await ipc.invoke('scan:deleteScan', scanId);
    setState(prev => ({
      ...prev,
      history: prev.history.filter(h => h.id !== scanId),
      ...(prev.activeScanId === scanId ? { activeScanId: null, findings: [], lastScanSummary: null } : {}),
    }));
  }, [ipc]);

  return (
    <ScanContext.Provider value={{
      state, startScan, stopScan, loadHistory, loadFindings, loadTrend,
      loadProfiles, updateFindingStatus, generateFix, applyFix, selectScan, deleteScan,
    }}>
      {children}
    </ScanContext.Provider>
  );
}

export function useScanContext() {
  const ctx = useContext(ScanContext);
  if (!ctx) throw new Error('useScanContext must be used within ScanProvider');
  return ctx;
}
