import Database from 'better-sqlite3';
import path from 'node:path';
import { app } from 'electron';
import {
  ScanRecord, Finding, DependencyFinding, ScanMetrics, ScanSummary,
  ScanComparison, FindingFilters, TrendDataPoint, ScanStatus, FindingStatus,
  ScanConfig, ScanLanguage, ScanProfileId, FindingSeverity,
} from './scan-types';

export class ScanStateStore {
  private db: ReturnType<typeof Database>;

  constructor(userDataPath?: string) {
    const dbPath = path.join(userDataPath || app.getPath('userData'), 'localmind.db');
    this.db = Database(dbPath);
    this.init();
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS scans (
        id            TEXT PRIMARY KEY,
        project_root  TEXT NOT NULL,
        project_name  TEXT,
        profile       TEXT NOT NULL,
        status        TEXT NOT NULL DEFAULT 'running',
        languages     TEXT,
        started_at    INTEGER NOT NULL,
        completed_at  INTEGER,
        total_files   INTEGER DEFAULT 0,
        files_scanned INTEGER DEFAULT 0,
        health_score  INTEGER,
        summary       TEXT,
        config        TEXT
      );

      CREATE TABLE IF NOT EXISTS findings (
        id              TEXT PRIMARY KEY,
        scan_id         TEXT NOT NULL,
        rule_id         TEXT NOT NULL,
        severity        TEXT NOT NULL,
        category        TEXT NOT NULL,
        type            TEXT NOT NULL,
        title           TEXT NOT NULL,
        description     TEXT NOT NULL,
        file_path       TEXT NOT NULL,
        line_start      INTEGER,
        line_end        INTEGER,
        column_start    INTEGER,
        code_snippet    TEXT,
        cwe_id          TEXT,
        owasp_category  TEXT,
        confidence      TEXT DEFAULT 'high',
        llm_validated   INTEGER DEFAULT 0,
        llm_verdict     TEXT,
        llm_explanation TEXT,
        fix_available   INTEGER DEFAULT 0,
        fix_code        TEXT,
        fix_explanation TEXT,
        status          TEXT DEFAULT 'open',
        created_at      INTEGER NOT NULL,
        FOREIGN KEY (scan_id) REFERENCES scans(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS dependency_findings (
        id              TEXT PRIMARY KEY,
        scan_id         TEXT NOT NULL,
        package_name    TEXT NOT NULL,
        current_version TEXT,
        fixed_version   TEXT,
        severity        TEXT NOT NULL,
        cve_id          TEXT,
        description     TEXT,
        ecosystem       TEXT NOT NULL,
        FOREIGN KEY (scan_id) REFERENCES scans(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS scan_metrics (
        id              TEXT PRIMARY KEY,
        scan_id         TEXT NOT NULL,
        project_root    TEXT NOT NULL,
        health_score    INTEGER,
        critical_count  INTEGER DEFAULT 0,
        high_count      INTEGER DEFAULT 0,
        medium_count    INTEGER DEFAULT 0,
        low_count       INTEGER DEFAULT 0,
        info_count      INTEGER DEFAULT 0,
        total_findings  INTEGER DEFAULT 0,
        files_scanned   INTEGER DEFAULT 0,
        scan_duration   INTEGER,
        llm_tokens_used INTEGER DEFAULT 0,
        timestamp       INTEGER NOT NULL,
        FOREIGN KEY (scan_id) REFERENCES scans(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_findings_scan ON findings(scan_id);
      CREATE INDEX IF NOT EXISTS idx_findings_severity ON findings(severity);
      CREATE INDEX IF NOT EXISTS idx_findings_file ON findings(file_path);
      CREATE INDEX IF NOT EXISTS idx_findings_type ON findings(type);
      CREATE INDEX IF NOT EXISTS idx_findings_status ON findings(status);
      CREATE INDEX IF NOT EXISTS idx_dep_findings_scan ON dependency_findings(scan_id);
      CREATE INDEX IF NOT EXISTS idx_metrics_project ON scan_metrics(project_root);
      CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON scan_metrics(timestamp);
      CREATE INDEX IF NOT EXISTS idx_scans_project ON scans(project_root);
      CREATE INDEX IF NOT EXISTS idx_scans_started ON scans(started_at DESC);
    `);
  }

  // ── Scan CRUD ──────────────────────────────────────────────────────────

  saveScan(scan: ScanRecord): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO scans (id, project_root, project_name, profile, status, languages, started_at, completed_at, total_files, files_scanned, health_score, summary, config)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      scan.id, scan.projectRoot, scan.projectName || null, scan.profile, scan.status,
      JSON.stringify(scan.languages), scan.startedAt, scan.completedAt || null,
      scan.totalFiles, scan.filesScanned, scan.healthScore ?? null,
      scan.summary || null, JSON.stringify(scan.config),
    );
  }

  updateScanStatus(scanId: string, status: ScanStatus, completedAt?: number, healthScore?: number, summary?: string): void {
    this.db.prepare(`
      UPDATE scans SET status = ?, completed_at = ?, health_score = ?, summary = ? WHERE id = ?
    `).run(status, completedAt || null, healthScore ?? null, summary || null, scanId);
  }

  getScan(scanId: string): ScanRecord | null {
    const row = this.db.prepare('SELECT * FROM scans WHERE id = ?').get(scanId) as any;
    return row ? this.mapScanRow(row) : null;
  }

  deleteScan(scanId: string): void {
    this.db.prepare('DELETE FROM scan_metrics WHERE scan_id = ?').run(scanId);
    this.db.prepare('DELETE FROM dependency_findings WHERE scan_id = ?').run(scanId);
    this.db.prepare('DELETE FROM findings WHERE scan_id = ?').run(scanId);
    this.db.prepare('DELETE FROM scans WHERE id = ?').run(scanId);
  }

  getHistory(projectRoot: string, limit: number = 50): ScanSummary[] {
    const rows = this.db.prepare(`
      SELECT s.*, 
        (SELECT COUNT(*) FROM findings WHERE scan_id = s.id) as total_findings,
        (SELECT COUNT(*) FROM findings WHERE scan_id = s.id AND severity = 'critical') as critical_count,
        (SELECT COUNT(*) FROM findings WHERE scan_id = s.id AND severity = 'high') as high_count
      FROM scans s
      WHERE s.project_root = ?
      ORDER BY s.started_at DESC
      LIMIT ?
    `).all(projectRoot, limit) as any[];

    return rows.map(row => ({
      id: row.id,
      projectRoot: row.project_root,
      projectName: row.project_name,
      profile: row.profile as ScanProfileId,
      status: row.status as ScanStatus,
      healthScore: row.health_score,
      totalFindings: row.total_findings || 0,
      criticalCount: row.critical_count || 0,
      highCount: row.high_count || 0,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      scanDuration: row.completed_at ? row.completed_at - row.started_at : undefined,
    }));
  }

  // ── Findings CRUD ──────────────────────────────────────────────────────

  saveFindings(findings: Finding[]): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO findings (id, scan_id, rule_id, severity, category, type, title, description, file_path, line_start, line_end, column_start, code_snippet, cwe_id, owasp_category, confidence, llm_validated, llm_verdict, llm_explanation, fix_available, fix_code, fix_explanation, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const tx = this.db.transaction((items: Finding[]) => {
      for (const f of items) {
        stmt.run(
          f.id, f.scanId, f.ruleId, f.severity, f.category, f.type, f.title, f.description,
          f.filePath, f.lineStart || null, f.lineEnd || null, f.columnStart || null,
          f.codeSnippet || null, f.cweId || null, f.owaspCategory || null,
          f.confidence, f.llmValidated ? 1 : 0, f.llmVerdict || null, f.llmExplanation || null,
          f.fixAvailable ? 1 : 0, f.fixCode || null, f.fixExplanation || null,
          f.status, f.createdAt,
        );
      }
    });

    tx(findings);
  }

  getFindings(scanId: string, filters?: FindingFilters): Finding[] {
    let sql = 'SELECT * FROM findings WHERE scan_id = ?';
    const params: any[] = [scanId];

    if (filters?.severity?.length) {
      sql += ` AND severity IN (${filters.severity.map(() => '?').join(',')})`;
      params.push(...filters.severity);
    }
    if (filters?.category?.length) {
      sql += ` AND category IN (${filters.category.map(() => '?').join(',')})`;
      params.push(...filters.category);
    }
    if (filters?.status?.length) {
      sql += ` AND status IN (${filters.status.map(() => '?').join(',')})`;
      params.push(...filters.status);
    }
    if (filters?.type?.length) {
      sql += ` AND type IN (${filters.type.map(() => '?').join(',')})`;
      params.push(...filters.type);
    }
    if (filters?.cweId) {
      sql += ` AND cwe_id = ?`;
      params.push(filters.cweId);
    }
    if (filters?.filePath) {
      sql += ` AND file_path LIKE ?`;
      params.push(`%${filters.filePath}%`);
    }
    if (filters?.searchQuery) {
      sql += ` AND (title LIKE ? OR description LIKE ? OR file_path LIKE ?)`;
      const q = `%${filters.searchQuery}%`;
      params.push(q, q, q);
    }
    if (filters?.llmVerdict?.length) {
      sql += ` AND llm_verdict IN (${filters.llmVerdict.map(() => '?').join(',')})`;
      params.push(...filters.llmVerdict);
    }

    sql += ` ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END, file_path`;

    if (filters?.limit) {
      sql += ` LIMIT ?`;
      params.push(filters.limit);
      if (filters.offset) {
        sql += ` OFFSET ?`;
        params.push(filters.offset);
      }
    }

    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map(this.mapFindingRow);
  }

  getFinding(findingId: string): Finding | null {
    const row = this.db.prepare('SELECT * FROM findings WHERE id = ?').get(findingId) as any;
    return row ? this.mapFindingRow(row) : null;
  }

  updateFindingStatus(findingId: string, status: FindingStatus): void {
    this.db.prepare('UPDATE findings SET status = ? WHERE id = ?').run(status, findingId);
  }

  updateFindingLlm(findingId: string, verdict: string, explanation: string, validated: boolean): void {
    this.db.prepare(`
      UPDATE findings SET llm_validated = ?, llm_verdict = ?, llm_explanation = ? WHERE id = ?
    `).run(validated ? 1 : 0, verdict, explanation, findingId);
  }

  updateFindingFix(findingId: string, fixCode: string, fixExplanation: string): void {
    this.db.prepare(`
      UPDATE findings SET fix_available = 1, fix_code = ?, fix_explanation = ? WHERE id = ?
    `).run(fixCode, fixExplanation, findingId);
  }

  // ── Dependency Findings ────────────────────────────────────────────────

  saveDependencyFindings(findings: DependencyFinding[]): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO dependency_findings (id, scan_id, package_name, current_version, fixed_version, severity, cve_id, description, ecosystem)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const tx = this.db.transaction((items: DependencyFinding[]) => {
      for (const f of items) {
        stmt.run(f.id, f.scanId, f.packageName, f.currentVersion || null, f.fixedVersion || null, f.severity, f.cveId || null, f.description || null, f.ecosystem);
      }
    });

    tx(findings);
  }

  getDependencyFindings(scanId: string): DependencyFinding[] {
    const rows = this.db.prepare('SELECT * FROM dependency_findings WHERE scan_id = ? ORDER BY CASE severity WHEN \'critical\' THEN 0 WHEN \'high\' THEN 1 WHEN \'medium\' THEN 2 ELSE 3 END').all(scanId) as any[];
    return rows.map(row => ({
      id: row.id,
      scanId: row.scan_id,
      packageName: row.package_name,
      currentVersion: row.current_version || undefined,
      fixedVersion: row.fixed_version || undefined,
      severity: row.severity as FindingSeverity,
      cveId: row.cve_id || undefined,
      description: row.description || undefined,
      ecosystem: row.ecosystem,
    }));
  }

  // ── Metrics ────────────────────────────────────────────────────────────

  saveMetrics(metrics: ScanMetrics): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO scan_metrics (id, scan_id, project_root, health_score, critical_count, high_count, medium_count, low_count, info_count, total_findings, files_scanned, scan_duration, llm_tokens_used, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      metrics.id, metrics.scanId, metrics.projectRoot, metrics.healthScore,
      metrics.criticalCount, metrics.highCount, metrics.mediumCount, metrics.lowCount, metrics.infoCount,
      metrics.totalFindings, metrics.filesScanned, metrics.scanDuration, metrics.llmTokensUsed, metrics.timestamp,
    );
  }

  getTrend(projectRoot: string, limit: number = 10): TrendDataPoint[] {
    const rows = this.db.prepare(`
      SELECT scan_id, health_score, total_findings, critical_count, high_count, timestamp
      FROM scan_metrics WHERE project_root = ? ORDER BY timestamp DESC LIMIT ?
    `).all(projectRoot, limit) as any[];

    return rows.reverse().map(row => ({
      scanId: row.scan_id,
      healthScore: row.health_score,
      totalFindings: row.total_findings,
      criticalCount: row.critical_count,
      highCount: row.high_count,
      timestamp: row.timestamp,
    }));
  }

  // ── Comparison ─────────────────────────────────────────────────────────

  compareScan(scanIdA: string, scanIdB: string): ScanComparison | null {
    const historyA = this.getScanAsSummary(scanIdA);
    const historyB = this.getScanAsSummary(scanIdB);
    if (!historyA || !historyB) return null;

    const findingsA = this.getFindings(scanIdA);
    const findingsB = this.getFindings(scanIdB);

    const keysA = new Set(findingsA.map(f => `${f.ruleId}:${f.filePath}:${f.lineStart}`));
    const keysB = new Set(findingsB.map(f => `${f.ruleId}:${f.filePath}:${f.lineStart}`));

    const newFindings = findingsB.filter(f => !keysA.has(`${f.ruleId}:${f.filePath}:${f.lineStart}`));
    const resolvedFindings = findingsA.filter(f => !keysB.has(`${f.ruleId}:${f.filePath}:${f.lineStart}`));
    const unchangedCount = findingsB.length - newFindings.length;

    return {
      scanA: historyA,
      scanB: historyB,
      newFindings,
      resolvedFindings,
      unchangedCount,
      healthScoreDelta: (historyB.healthScore || 0) - (historyA.healthScore || 0),
    };
  }

  private getScanAsSummary(scanId: string): ScanSummary | null {
    const row = this.db.prepare(`
      SELECT s.*,
        (SELECT COUNT(*) FROM findings WHERE scan_id = s.id) as total_findings,
        (SELECT COUNT(*) FROM findings WHERE scan_id = s.id AND severity = 'critical') as critical_count,
        (SELECT COUNT(*) FROM findings WHERE scan_id = s.id AND severity = 'high') as high_count
      FROM scans s WHERE s.id = ?
    `).get(scanId) as any;

    if (!row) return null;
    return {
      id: row.id,
      projectRoot: row.project_root,
      projectName: row.project_name,
      profile: row.profile as ScanProfileId,
      status: row.status as ScanStatus,
      healthScore: row.health_score,
      totalFindings: row.total_findings || 0,
      criticalCount: row.critical_count || 0,
      highCount: row.high_count || 0,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      scanDuration: row.completed_at ? row.completed_at - row.started_at : undefined,
    };
  }

  // ── Row Mappers ────────────────────────────────────────────────────────

  private mapScanRow(row: any): ScanRecord {
    return {
      id: row.id,
      projectRoot: row.project_root,
      projectName: row.project_name,
      profile: row.profile as ScanProfileId,
      status: row.status as ScanStatus,
      languages: row.languages ? JSON.parse(row.languages) : [],
      startedAt: row.started_at,
      completedAt: row.completed_at || undefined,
      totalFiles: row.total_files,
      filesScanned: row.files_scanned,
      healthScore: row.health_score ?? undefined,
      summary: row.summary || undefined,
      config: row.config ? JSON.parse(row.config) : {},
    };
  }

  private mapFindingRow(row: any): Finding {
    return {
      id: row.id,
      scanId: row.scan_id,
      ruleId: row.rule_id,
      severity: row.severity as FindingSeverity,
      category: row.category,
      type: row.type,
      title: row.title,
      description: row.description,
      filePath: row.file_path,
      lineStart: row.line_start || undefined,
      lineEnd: row.line_end || undefined,
      columnStart: row.column_start || undefined,
      codeSnippet: row.code_snippet || undefined,
      cweId: row.cwe_id || undefined,
      owaspCategory: row.owasp_category || undefined,
      confidence: row.confidence || 'high',
      llmValidated: row.llm_validated === 1,
      llmVerdict: row.llm_verdict || undefined,
      llmExplanation: row.llm_explanation || undefined,
      fixAvailable: row.fix_available === 1,
      fixCode: row.fix_code || undefined,
      fixExplanation: row.fix_explanation || undefined,
      status: row.status as FindingStatus,
      createdAt: row.created_at,
    };
  }
}

let instance: ScanStateStore | null = null;
export function getScanStateStore(): ScanStateStore {
  if (!instance) instance = new ScanStateStore();
  return instance;
}
