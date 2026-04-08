import { BrowserWindow } from 'electron';
import { v4 as uuid } from 'uuid';
import {
  ScanConfig, ScanRecord, ScanResults, Finding, DependencyFinding,
  ScanMetrics, ScanProgress, ScanPhase, FindingFilters, ReportOptions,
  ReportResult, FixResult, ApplyResult, ScanSummary, ScanComparison,
  TrendDataPoint, FindingStatus,
} from './scan-types';
import { ScanEngine, getScanEngine } from './scan-engine';
import { ScanStateStore, getScanStateStore } from './scan-state';
import { ScanAnalyzer, getScanAnalyzer } from './scan-analyzer';
import { FixGenerator, getFixGenerator } from './fix-generator';
import { VectorDBService } from './vectordb';
import { OllamaEmbeddingsService } from './embeddings';
import { getProfileById } from './scan-profiles';

export class ScanOrchestrator {
  private engine: ScanEngine;
  private stateStore: ScanStateStore;
  private analyzer: ScanAnalyzer;
  private fixGen: FixGenerator;
  private vectordb: VectorDBService | null = null;
  private activeScanIds = new Set<string>();

  constructor() {
    this.engine = getScanEngine();
    this.stateStore = getScanStateStore();
    this.analyzer = getScanAnalyzer();
    this.fixGen = getFixGenerator();
  }

  setVectorDB(vectordb: VectorDBService): void {
    this.vectordb = vectordb;
  }

  // ── Main Scan Entry ────────────────────────────────────────────────────

  async startScan(config: ScanConfig, externalScanId?: string): Promise<{ scanId: string }> {
    const startTime = Date.now();

    if (externalScanId) this.activeScanIds.add(externalScanId);

    const { scan, findings, dependencyFindings } = await this.engine.scan(config, {
      onProgress: (progress) => {
        this.emitProgress(progress);
      },
      onFinding: (finding) => {
        this.emitFinding(finding);
      },
    }, externalScanId);

    const scanId = scan.id;
    this.activeScanIds.add(scanId);

    try {
      this.stateStore.saveScan(scan);
      this.stateStore.saveFindings(findings);
      this.stateStore.saveDependencyFindings(dependencyFindings);

      // ── LLM Deep Analysis (if enabled) ───────────────────────────
      let enrichedFindings = findings;

      if (config.enableLlmReview && findings.length > 0) {
        this.emitProgress({
          scanId, phase: 'llm_analysis', filesScanned: scan.filesScanned,
          totalFiles: scan.totalFiles, findingsCount: findings.length,
          elapsedMs: Date.now() - startTime, message: 'LLM analyzing findings...',
        });

        try {
          const reviewResults = await this.analyzer.reviewFindings(
            findings, config.projectRoot,
            (reviewed, total) => {
              this.emitProgress({
                scanId, phase: 'llm_analysis', filesScanned: scan.filesScanned,
                totalFiles: scan.totalFiles, findingsCount: findings.length,
                elapsedMs: Date.now() - startTime,
                message: `LLM reviewed ${reviewed}/${total} findings`,
              });
            },
          );

          for (const [findingId, result] of reviewResults) {
            this.stateStore.updateFindingLlm(findingId, result.verdict, result.explanation, true);

            const finding = enrichedFindings.find(f => f.id === findingId);
            if (finding) {
              finding.llmValidated = true;
              finding.llmVerdict = result.verdict;
              finding.llmExplanation = result.explanation;
            }
          }

          enrichedFindings = enrichedFindings.filter(f =>
            !f.llmValidated || f.llmVerdict !== 'false_positive'
          );
        } catch (llmErr) {
          console.warn('[ScanOrchestrator] LLM analysis failed, continuing with static results:', llmErr);
        }
      }

      // ── Summary Generation ───────────────────────────────────────
      this.emitProgress({
        scanId, phase: 'generating_summary', filesScanned: scan.filesScanned,
        totalFiles: scan.totalFiles, findingsCount: enrichedFindings.length,
        elapsedMs: Date.now() - startTime,
      });

      let summary: string | undefined;
      if (config.enableLlmReview) {
        try {
          summary = await this.analyzer.generateScanSummary(
            enrichedFindings, scan.projectName || 'project',
            scan.filesScanned, scan.healthScore || 100,
          );
        } catch { /* fallback below */ }
      }

      if (!summary) {
        const c = enrichedFindings.filter(f => f.severity === 'critical').length;
        const h = enrichedFindings.filter(f => f.severity === 'high').length;
        summary = `Scan found ${enrichedFindings.length} issues (${c} critical, ${h} high) across ${scan.filesScanned} files. Health score: ${scan.healthScore}/100.`;
      }

      // ── Finalize ─────────────────────────────────────────────────
      const healthScore = scan.healthScore ?? 100;
      this.stateStore.updateScanStatus(scanId, 'complete', Date.now(), healthScore, summary);

      const metrics = this.buildMetrics(scanId, scan, enrichedFindings, dependencyFindings, startTime);
      this.stateStore.saveMetrics(metrics);

      this.emitComplete(scanId, {
        id: scanId, projectRoot: config.projectRoot, projectName: scan.projectName,
        profile: config.profile, status: 'complete', healthScore,
        totalFindings: enrichedFindings.length,
        criticalCount: enrichedFindings.filter(f => f.severity === 'critical').length,
        highCount: enrichedFindings.filter(f => f.severity === 'high').length,
        startedAt: scan.startedAt, completedAt: Date.now(),
        scanDuration: Date.now() - startTime,
      });

      return { scanId };

    } catch (err) {
      this.stateStore.updateScanStatus(scanId, 'failed', Date.now());
      this.emitError(scanId, String(err));
      return { scanId };

    } finally {
      this.activeScanIds.delete(scanId);
    }
  }

  stopScan(scanId: string): void {
    this.engine.cancel(scanId);
    this.activeScanIds.delete(scanId);
    this.stateStore.updateScanStatus(scanId, 'cancelled', Date.now());
  }

  // ── Query Methods ──────────────────────────────────────────────────────

  getScanStatus(scanId: string): ScanRecord | null {
    return this.stateStore.getScan(scanId);
  }

  getScanResults(scanId: string): ScanResults | null {
    const scan = this.stateStore.getScan(scanId);
    if (!scan) return null;

    const findings = this.stateStore.getFindings(scanId);
    const dependencyFindings = this.stateStore.getDependencyFindings(scanId);

    const metrics: ScanMetrics = {
      id: `metrics_${scanId}`,
      scanId,
      projectRoot: scan.projectRoot,
      healthScore: scan.healthScore || 0,
      criticalCount: findings.filter(f => f.severity === 'critical').length,
      highCount: findings.filter(f => f.severity === 'high').length,
      mediumCount: findings.filter(f => f.severity === 'medium').length,
      lowCount: findings.filter(f => f.severity === 'low').length,
      infoCount: findings.filter(f => f.severity === 'info').length,
      totalFindings: findings.length,
      filesScanned: scan.filesScanned,
      scanDuration: scan.completedAt ? scan.completedAt - scan.startedAt : 0,
      llmTokensUsed: 0,
      timestamp: scan.startedAt,
    };

    return { scan, findings, dependencyFindings, metrics };
  }

  getFindings(scanId: string, filters?: FindingFilters): Finding[] {
    return this.stateStore.getFindings(scanId, filters);
  }

  getFinding(findingId: string): Finding | null {
    return this.stateStore.getFinding(findingId);
  }

  updateFindingStatus(findingId: string, status: FindingStatus): void {
    this.stateStore.updateFindingStatus(findingId, status);
  }

  getHistory(projectRoot: string, limit?: number): ScanSummary[] {
    return this.stateStore.getHistory(projectRoot, limit);
  }

  deleteScan(scanId: string): void {
    this.stateStore.deleteScan(scanId);
  }

  compareScan(scanIdA: string, scanIdB: string): ScanComparison | null {
    return this.stateStore.compareScan(scanIdA, scanIdB);
  }

  getTrend(projectRoot: string, limit?: number): TrendDataPoint[] {
    return this.stateStore.getTrend(projectRoot, limit);
  }

  // ── Fix Generation ─────────────────────────────────────────────────────

  async generateFix(findingId: string): Promise<FixResult> {
    const finding = this.stateStore.getFinding(findingId);
    if (!finding) throw new Error(`Finding ${findingId} not found`);

    const scan = this.stateStore.getScan(finding.scanId);
    if (!scan) throw new Error(`Scan ${finding.scanId} not found`);

    const fix = await this.fixGen.generateFix(finding, scan.projectRoot);

    this.stateStore.updateFindingFix(findingId, fix.fixedCode, fix.explanation);

    return fix;
  }

  async applyFix(findingId: string): Promise<ApplyResult> {
    const finding = this.stateStore.getFinding(findingId);
    if (!finding) throw new Error(`Finding ${findingId} not found`);
    if (!finding.fixCode) throw new Error('No fix available for this finding');

    const scan = this.stateStore.getScan(finding.scanId);
    if (!scan) throw new Error(`Scan ${finding.scanId} not found`);

    const fixResult: FixResult = {
      findingId: finding.id,
      fixedCode: finding.fixCode,
      explanation: finding.fixExplanation || '',
      breakingChanges: false,
    };

    const result = await this.fixGen.applyFix(finding, fixResult, scan.projectRoot);

    if (result.success) {
      this.stateStore.updateFindingStatus(findingId, 'fixed');
    }

    return result;
  }

  // ── Metrics Builder ────────────────────────────────────────────────────

  private buildMetrics(
    scanId: string,
    scan: ScanRecord,
    findings: Finding[],
    depFindings: DependencyFinding[],
    startTime: number,
  ): ScanMetrics {
    return {
      id: uuid(),
      scanId,
      projectRoot: scan.projectRoot,
      healthScore: scan.healthScore || 0,
      criticalCount: findings.filter(f => f.severity === 'critical').length,
      highCount: findings.filter(f => f.severity === 'high').length,
      mediumCount: findings.filter(f => f.severity === 'medium').length,
      lowCount: findings.filter(f => f.severity === 'low').length,
      infoCount: findings.filter(f => f.severity === 'info').length,
      totalFindings: findings.length,
      filesScanned: scan.filesScanned,
      scanDuration: Date.now() - startTime,
      llmTokensUsed: 0,
      timestamp: Date.now(),
    };
  }

  // ── Event Emitters ─────────────────────────────────────────────────────

  private emitProgress(progress: ScanProgress): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('scan:progress', progress);
    }
  }

  private emitFinding(finding: Finding): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('scan:finding', { scanId: finding.scanId, finding });
    }
  }

  private emitComplete(scanId: string, summary: ScanSummary): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('scan:complete', { scanId, summary });
    }
  }

  private emitError(scanId: string, error: string): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('scan:error', { scanId, error });
    }
  }
}

let instance: ScanOrchestrator | null = null;
export function getScanOrchestrator(): ScanOrchestrator {
  if (!instance) instance = new ScanOrchestrator();
  return instance;
}
