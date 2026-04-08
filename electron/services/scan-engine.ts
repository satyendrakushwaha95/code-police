import * as fs from 'fs';
import * as path from 'path';
import { BrowserWindow } from 'electron';
import { v4 as uuid } from 'uuid';
import {
  ScanConfig, ScanRecord, Finding, ScanProgress, ScanPhase,
  ScanLanguage, FindingSeverity, ScanProfileId, RawFinding,
  DependencyFinding, DependencyAuditResult,
} from './scan-types';
import { RuleRegistry, loadAllRules, detectLanguage, isBinaryFile, extractSnippet } from './rules/rule-registry';
import { getGeneralRules } from './rules/general-rules';
import { getJavaRules } from './rules/java-rules';
import { getAngularRules } from './rules/angular-rules';
import { getPhpRules } from './rules/php-rules';
import { getProfileById } from './scan-profiles';
import { DependencyAuditor, getDependencyAuditor } from './dependency-auditor';
import { analyzeProject, ProjectAnalysis } from './project-analyzer';

const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.svn', '.hg', '.next', 'dist', 'build', 'out',
  'coverage', '.cache', '__pycache__', '.tox', '.venv', 'venv',
  'target', '.gradle', '.idea', '.vscode', '.output', '.nuxt',
  'vendor', 'bower_components', '.svelte-kit', '.angular',
  'tmp', 'temp', 'logs',
]);

const DEFAULT_MAX_FILE_SIZE = 500 * 1024; // 500KB

export interface ScanEngineCallbacks {
  onProgress: (progress: ScanProgress) => void;
  onFinding: (finding: Finding) => void;
}

export class ScanEngine {
  private registry: RuleRegistry;
  private depAuditor: DependencyAuditor;
  private cancelledScans = new Set<string>();

  constructor() {
    this.registry = loadAllRules(
      getGeneralRules(),
      getJavaRules(),
      getAngularRules(),
      getPhpRules(),
    );
    this.depAuditor = getDependencyAuditor();
  }

  cancel(scanId: string): void {
    this.cancelledScans.add(scanId);
  }

  private isCancelled(scanId: string): boolean {
    return this.cancelledScans.has(scanId);
  }

  async scan(config: ScanConfig, callbacks: ScanEngineCallbacks, externalScanId?: string): Promise<{
    scan: ScanRecord;
    findings: Finding[];
    dependencyFindings: DependencyFinding[];
  }> {
    const scanId = externalScanId || uuid();
    const startTime = Date.now();
    const profile = getProfileById(config.profile);

    const scan: ScanRecord = {
      id: scanId,
      projectRoot: config.projectRoot,
      projectName: path.basename(config.projectRoot),
      profile: config.profile,
      status: 'running',
      languages: [],
      startedAt: startTime,
      totalFiles: 0,
      filesScanned: 0,
      config,
    };

    const allFindings: Finding[] = [];
    const allDepFindings: DependencyFinding[] = [];

    try {
      // ── Phase 1: Project Analysis ──────────────────────────────────
      this.emitProgress(callbacks, scanId, 'analyzing_project', 0, 0, startTime);

      let analysis: ProjectAnalysis | null = null;
      try {
        analysis = await analyzeProject(config.projectRoot);
      } catch {
        // project-analyzer failure is non-fatal
      }

      if (this.isCancelled(scanId)) return this.cancelled(scan, allFindings, allDepFindings);

      const detectedLanguages = this.detectProjectLanguages(config, analysis);
      scan.languages = detectedLanguages;

      // ── Phase 2: File Discovery ────────────────────────────────────
      this.emitProgress(callbacks, scanId, 'discovering_files', 0, 0, startTime);

      let files: string[];
      if (profile?.quickScanOnly) {
        files = await this.discoverChangedFiles(config.projectRoot);
      } else {
        files = this.discoverFiles(config.projectRoot, config);
      }

      const maxSize = config.maxFileSizeBytes || DEFAULT_MAX_FILE_SIZE;
      files = files.filter(f => {
        try {
          const stat = fs.statSync(path.join(config.projectRoot, f));
          return stat.size <= maxSize;
        } catch {
          return false;
        }
      });

      scan.totalFiles = files.length;

      if (this.isCancelled(scanId)) return this.cancelled(scan, allFindings, allDepFindings);

      // ── Phase 3: Static Rule Scanning ──────────────────────────────
      const applicableRules = this.registry.getRulesFiltered({
        languages: [...detectedLanguages, 'general'],
        categories: profile?.ruleFilter?.categories,
        severities: profile?.ruleFilter?.severities,
        ruleIds: config.customRuleIds || profile?.ruleFilter?.ruleIds,
      });

      for (let i = 0; i < files.length; i++) {
        if (this.isCancelled(scanId)) return this.cancelled(scan, allFindings, allDepFindings);

        const relPath = files[i];
        const absPath = path.join(config.projectRoot, relPath);

        this.emitProgress(callbacks, scanId, 'scanning_rules', i, files.length, startTime, relPath, allFindings.length);

        try {
          const content = fs.readFileSync(absPath, 'utf-8');
          const fileRules = applicableRules.filter(rule => {
            const ext = path.extname(relPath).toLowerCase();
            const fileName = path.basename(relPath).toLowerCase();
            return this.matchesAnyPattern(relPath, ext, fileName, rule.filePatterns) &&
                   !(rule.excludePatterns && this.matchesAnyPattern(relPath, ext, fileName, rule.excludePatterns));
          });

          for (const rule of fileRules) {
            try {
              const rawFindings = rule.detect(content, relPath);

              for (const raw of rawFindings) {
                const finding = this.createFinding(scanId, rule, raw, relPath, content);

                if (config.severityThreshold && !this.meetsThreshold(finding.severity, config.severityThreshold)) {
                  continue;
                }

                allFindings.push(finding);
                callbacks.onFinding(finding);
              }
            } catch (ruleErr) {
              console.warn(`[ScanEngine] Rule ${rule.id} failed on ${relPath}:`, ruleErr);
            }
          }
        } catch {
          // file read failure — skip
        }

        scan.filesScanned = i + 1;
      }

      if (this.isCancelled(scanId)) return this.cancelled(scan, allFindings, allDepFindings);

      // ── Phase 4: Dependency Audit ──────────────────────────────────
      if (config.enableDependencyAudit) {
        this.emitProgress(callbacks, scanId, 'auditing_dependencies', files.length, files.length, startTime, undefined, allFindings.length);

        try {
          const depResults = await this.depAuditor.auditProject(config.projectRoot, scanId);
          for (const result of depResults) {
            allDepFindings.push(...result.findings);
          }
        } catch (depErr) {
          console.warn('[ScanEngine] Dependency audit failed:', depErr);
        }
      }

      if (this.isCancelled(scanId)) return this.cancelled(scan, allFindings, allDepFindings);

      // ── Phase 5: Aggregation ───────────────────────────────────────
      this.emitProgress(callbacks, scanId, 'aggregating', files.length, files.length, startTime, undefined, allFindings.length);

      const deduped = this.deduplicateFindings(allFindings);
      const healthScore = this.calculateHealthScore(deduped, allDepFindings);

      scan.status = 'complete';
      scan.completedAt = Date.now();
      scan.healthScore = healthScore;
      scan.filesScanned = files.length;

      this.emitProgress(callbacks, scanId, 'complete', files.length, files.length, startTime, undefined, deduped.length);

      return { scan, findings: deduped, dependencyFindings: allDepFindings };

    } catch (err) {
      scan.status = 'failed';
      scan.completedAt = Date.now();
      console.error('[ScanEngine] Scan failed:', err);
      return { scan, findings: allFindings, dependencyFindings: allDepFindings };

    } finally {
      this.cancelledScans.delete(scanId);
    }
  }

  // ── File Discovery ─────────────────────────────────────────────────────

  private discoverFiles(root: string, config: ScanConfig): string[] {
    const files: string[] = [];
    const gitignorePatterns = this.parseGitignore(root);

    const walk = (dir: string, relDir: string, depth: number) => {
      if (depth > 15) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.') && entry.name !== '.env' && !entry.name.startsWith('.env.')) continue;
          if (IGNORED_DIRS.has(entry.name)) continue;

          const fullPath = path.join(dir, entry.name);
          const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;

          if (this.matchesGitignore(relPath, gitignorePatterns)) continue;

          if (entry.isDirectory()) {
            walk(fullPath, relPath, depth + 1);
          } else if (entry.isFile() && !isBinaryFile(relPath)) {
            if (config.fileGlobs?.length) {
              if (config.fileGlobs.some(g => this.simpleGlobMatch(relPath, g))) {
                files.push(relPath);
              }
            } else {
              files.push(relPath);
            }
          }
        }
      } catch { /* permission error */ }
    };

    walk(root, '', 0);
    return files;
  }

  private async discoverChangedFiles(root: string): Promise<string[]> {
    try {
      const { execSync } = await import('child_process');
      const output = execSync('git diff --name-only HEAD 2>&1 && git diff --name-only --cached 2>&1', {
        cwd: root,
        encoding: 'utf-8',
        timeout: 10_000,
      });

      const files = output.split('\n')
        .map(f => f.trim())
        .filter(f => f.length > 0 && !isBinaryFile(f));

      return [...new Set(files)];
    } catch {
      return this.discoverFiles(root, { projectRoot: root, profile: 'quick', enableLlmReview: false, enableDependencyAudit: false, enableConfigAudit: false });
    }
  }

  private parseGitignore(root: string): string[] {
    try {
      const content = fs.readFileSync(path.join(root, '.gitignore'), 'utf-8');
      return content.split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('#'));
    } catch {
      return [];
    }
  }

  private matchesGitignore(relPath: string, patterns: string[]): boolean {
    for (const pattern of patterns) {
      if (pattern.endsWith('/') && relPath.startsWith(pattern.slice(0, -1))) return true;
      if (this.simpleGlobMatch(relPath, pattern)) return true;
      if (this.simpleGlobMatch(path.basename(relPath), pattern)) return true;
    }
    return false;
  }

  // ── Language Detection ─────────────────────────────────────────────────

  private detectProjectLanguages(config: ScanConfig, analysis: ProjectAnalysis | null): ScanLanguage[] {
    if (config.languages?.length) return config.languages;

    const languages = new Set<ScanLanguage>();

    if (analysis) {
      const lang = analysis.techStack.language.toLowerCase();
      const framework = (analysis.techStack.framework || '').toLowerCase();

      if (lang === 'java' || lang === 'kotlin' || framework.includes('spring') || framework.includes('gradle') || framework.includes('maven')) {
        languages.add('java');
      }
      if (lang === 'typescript' || lang === 'javascript' || framework.includes('angular')) {
        languages.add('angular');
      }
      if (lang === 'php' || framework.includes('laravel') || framework.includes('php')) {
        languages.add('php');
      }

      const exts = analysis.fileStats.byExtension;
      if (exts['.java'] || exts['.kt']) languages.add('java');
      if (exts['.ts'] || exts['.tsx']) languages.add('angular');
      if (exts['.php']) languages.add('php');
    }

    if (languages.size === 0) {
      return ['java', 'angular', 'php'];
    }

    return Array.from(languages);
  }

  // ── Finding Creation ───────────────────────────────────────────────────

  private createFinding(
    scanId: string,
    rule: import('./scan-types').ScanRule,
    raw: RawFinding,
    filePath: string,
    fileContent: string,
  ): Finding {
    const snippet = raw.context || extractSnippet(fileContent, raw.line);

    return {
      id: uuid(),
      scanId,
      ruleId: rule.id,
      severity: rule.severity,
      category: rule.category,
      type: rule.id.split('/')[1] || rule.id,
      title: rule.title,
      description: rule.description,
      filePath,
      lineStart: raw.line,
      lineEnd: raw.endLine || raw.line,
      columnStart: raw.column,
      codeSnippet: snippet,
      cweId: rule.cweId,
      owaspCategory: rule.owaspCategory,
      confidence: 'high',
      llmValidated: false,
      fixAvailable: false,
      status: 'open',
      createdAt: Date.now(),
    };
  }

  // ── Deduplication ──────────────────────────────────────────────────────

  private deduplicateFindings(findings: Finding[]): Finding[] {
    const seen = new Map<string, Finding>();

    for (const finding of findings) {
      const key = `${finding.ruleId}:${finding.filePath}:${finding.lineStart}`;
      if (!seen.has(key)) {
        seen.set(key, finding);
      }
    }

    return Array.from(seen.values());
  }

  // ── Health Score ───────────────────────────────────────────────────────

  private calculateHealthScore(findings: Finding[], depFindings: DependencyFinding[]): number {
    let penalty = 0;

    for (const f of findings) {
      switch (f.severity) {
        case 'critical': penalty += 15; break;
        case 'high': penalty += 8; break;
        case 'medium': penalty += 4; break;
        case 'low': penalty += 1; break;
      }
    }

    for (const d of depFindings) {
      switch (d.severity) {
        case 'critical': penalty += 10; break;
        case 'high': penalty += 5; break;
        case 'medium': penalty += 2; break;
        case 'low': penalty += 1; break;
      }
    }

    return Math.max(0, Math.min(100, 100 - penalty));
  }

  // ── Threshold Check ────────────────────────────────────────────────────

  private meetsThreshold(severity: FindingSeverity, threshold: FindingSeverity): boolean {
    const order: FindingSeverity[] = ['critical', 'high', 'medium', 'low', 'info'];
    return order.indexOf(severity) <= order.indexOf(threshold);
  }

  // ── Progress Emission ──────────────────────────────────────────────────

  private emitProgress(
    callbacks: ScanEngineCallbacks,
    scanId: string,
    phase: ScanPhase,
    filesScanned: number,
    totalFiles: number,
    startTime: number,
    currentFile?: string,
    findingsCount?: number,
  ): void {
    callbacks.onProgress({
      scanId,
      phase,
      filesScanned,
      totalFiles,
      currentFile,
      findingsCount: findingsCount || 0,
      elapsedMs: Date.now() - startTime,
    });
  }

  // ── Pattern Matching ───────────────────────────────────────────────────

  private matchesAnyPattern(filePath: string, ext: string, fileName: string, patterns: string[]): boolean {
    for (const pattern of patterns) {
      if (pattern.startsWith('*.')) {
        const patternExt = pattern.slice(1);
        if (ext === patternExt || filePath.endsWith(patternExt)) return true;
      } else if (pattern.includes('*')) {
        if (this.simpleGlobMatch(fileName, pattern) || this.simpleGlobMatch(filePath, pattern)) return true;
      } else {
        if (fileName === pattern.toLowerCase() || filePath.endsWith(pattern)) return true;
      }
    }
    return false;
  }

  private simpleGlobMatch(str: string, pattern: string): boolean {
    const regex = new RegExp(
      '^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$',
      'i'
    );
    return regex.test(str);
  }

  // ── Cancellation ───────────────────────────────────────────────────────

  private cancelled(scan: ScanRecord, findings: Finding[], depFindings: DependencyFinding[]) {
    scan.status = 'cancelled';
    scan.completedAt = Date.now();
    return { scan, findings, dependencyFindings: depFindings };
  }
}

let instance: ScanEngine | null = null;
export function getScanEngine(): ScanEngine {
  if (!instance) instance = new ScanEngine();
  return instance;
}
