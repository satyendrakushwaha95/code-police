import { BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  ScanRecord, Finding, DependencyFinding, ScanMetrics,
  ReportOptions, ReportResult, ReportFormat, ReportData,
  TrendDataPoint, FindingSeverity,
} from './scan-types';
import { getScanStateStore } from './scan-state';

const SEVERITY_ORDER: FindingSeverity[] = ['critical', 'high', 'medium', 'low', 'info'];

const SEVERITY_COLORS: Record<FindingSeverity, string> = {
  critical: '#ff4757',
  high: '#ff6b35',
  medium: '#ffa502',
  low: '#2ed573',
  info: '#70a1ff',
};

const SARIF_LEVEL: Record<FindingSeverity, string> = {
  critical: 'error',
  high: 'error',
  medium: 'warning',
  low: 'note',
  info: 'note',
};

const FORMAT_EXT: Record<ReportFormat, string> = {
  html: '.html',
  pdf: '.pdf',
  sarif: '.sarif',
  json: '.json',
  markdown: '.md',
};

export class ReportGenerator {

  // ── Public API ────────────────────────────────────────────────────────

  async generate(options: ReportOptions): Promise<ReportResult> {
    const data = this.getReportData(options.scanId);
    if (!data) throw new Error(`Scan not found: ${options.scanId}`);

    if (options.severityFilter?.length) {
      data.findings = data.findings.filter(f => options.severityFilter!.includes(f.severity));
    }

    let content: string;
    let binary: Buffer | null = null;

    switch (options.format) {
      case 'html':
        content = this.generateHtml(data, options);
        break;
      case 'pdf': {
        const html = this.generateHtml(data, options);
        const pdfPath = options.outputPath
          || path.join(os.tmpdir(), `localmind-report-${options.scanId}${FORMAT_EXT.pdf}`);
        binary = await this.generatePdf(html, pdfPath);
        if (options.outputPath) {
          this.ensureDir(options.outputPath);
          fs.writeFileSync(options.outputPath, binary);
          return { filePath: options.outputPath, format: 'pdf', sizeBytes: binary.length };
        }
        this.ensureDir(pdfPath);
        fs.writeFileSync(pdfPath, binary);
        return { filePath: pdfPath, format: 'pdf', sizeBytes: binary.length };
      }
      case 'sarif':
        content = this.generateSarif(data, options);
        break;
      case 'json':
        content = this.generateJson(data);
        break;
      case 'markdown':
        content = this.generateMarkdown(data, options);
        break;
      default:
        throw new Error(`Unsupported report format: ${options.format}`);
    }

    const sizeBytes = Buffer.byteLength(content, 'utf-8');

    if (options.outputPath) {
      this.ensureDir(options.outputPath);
      fs.writeFileSync(options.outputPath, content, 'utf-8');
      return { filePath: options.outputPath, format: options.format, sizeBytes };
    }

    return { content, format: options.format, sizeBytes };
  }

  getReportData(scanId: string): ReportData | null {
    const store = getScanStateStore();
    const scan = store.getScan(scanId);
    if (!scan) return null;

    const findings = store.getFindings(scanId);
    const dependencyFindings = store.getDependencyFindings(scanId);
    const trend = store.getTrend(scan.projectRoot);
    const metrics = this.computeMetrics(scan, findings);

    return {
      scan,
      findings,
      dependencyFindings,
      metrics,
      trend,
      executiveSummary: scan.summary,
    };
  }

  // ── HTML ──────────────────────────────────────────────────────────────

  private generateHtml(data: ReportData, options: ReportOptions): string {
    const { scan, findings, dependencyFindings, metrics } = data;
    const projectName = scan.projectName || path.basename(scan.projectRoot);
    const scanDate = this.fmtDate(scan.startedAt);
    const duration = this.fmtDuration(metrics.scanDuration);
    const healthScore = metrics.healthScore;
    const scoreColor = this.scoreColor(healthScore);

    const severityCounts: Record<FindingSeverity, number> = {
      critical: metrics.criticalCount,
      high: metrics.highCount,
      medium: metrics.mediumCount,
      low: metrics.lowCount,
      info: metrics.infoCount,
    };
    const maxCount = Math.max(...Object.values(severityCounts), 1);

    const severityBarsHtml = SEVERITY_ORDER
      .map(sev => {
        const count = severityCounts[sev];
        const pct = (count / maxCount) * 100;
        return `<div class="bar-row">
          <span class="bar-label" style="color:${SEVERITY_COLORS[sev]}">${this.capFirst(sev)}</span>
          <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${SEVERITY_COLORS[sev]}"></div></div>
          <span class="bar-count">${count}</span>
        </div>`;
      })
      .join('\n');

    const groupedFindings = this.groupBySeverity(findings);
    const findingsSectionsHtml = SEVERITY_ORDER
      .filter(sev => groupedFindings[sev]?.length)
      .map(sev => {
        const group = groupedFindings[sev]!;
        const cardsHtml = group
          .map(f => this.htmlFindingCard(f, options))
          .join('\n');
        return `<div class="severity-group">
          <h3 style="color:${SEVERITY_COLORS[sev]}">${this.capFirst(sev)} (${group.length})</h3>
          ${cardsHtml}
        </div>`;
      })
      .join('\n');

    const depRowsHtml = dependencyFindings
      .map(d => `<tr>
        <td>${this.esc(d.packageName)}</td>
        <td>${this.esc(d.currentVersion || '—')}</td>
        <td>${this.esc(d.fixedVersion || '—')}</td>
        <td><span class="sev-pill" style="background:${SEVERITY_COLORS[d.severity]}">${this.capFirst(d.severity)}</span></td>
        <td>${d.cveId ? this.esc(d.cveId) : '—'}</td>
        <td>${this.esc(d.description || '—')}</td>
      </tr>`)
      .join('\n');

    const depTableHtml = dependencyFindings.length
      ? `<section>
          <h2>Dependency Vulnerabilities</h2>
          <table>
            <thead><tr><th>Package</th><th>Current</th><th>Fixed</th><th>Severity</th><th>CVE</th><th>Description</th></tr></thead>
            <tbody>${depRowsHtml}</tbody>
          </table>
        </section>`
      : '';

    const summaryText = data.executiveSummary
      ? `<p class="summary-text">${this.esc(data.executiveSummary)}</p>`
      : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Security Scan Report — ${this.esc(projectName)}</title>
<style>
:root {
  --bg-primary: #1a1a1a;
  --bg-secondary: #242424;
  --bg-tertiary: #2d2d2d;
  --text-primary: #e0e0e0;
  --text-secondary: #a0a0a0;
  --text-muted: #707070;
  --border: #3a3a3a;
  --accent: #646cff;
  --radius: 8px;
}
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
body {
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
  font-size: 14px;
  line-height: 1.6;
  padding: 2rem;
}
.container { max-width: 960px; margin: 0 auto; }
header { margin-bottom: 2rem; }
header h1 { font-size: 1.75rem; font-weight: 700; color: #fff; }
header .subtitle { color: var(--text-secondary); font-size: 0.9rem; margin-top: 0.25rem; }
.meta-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1rem;
  margin-top: 1.5rem;
}
.meta-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1rem;
}
.meta-card .label { font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
.meta-card .value { font-size: 1.1rem; font-weight: 600; color: #fff; margin-top: 0.25rem; }
h2 {
  font-size: 1.25rem;
  font-weight: 600;
  color: #fff;
  margin-top: 2.5rem;
  margin-bottom: 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--border);
}
h3 { font-size: 1rem; font-weight: 600; margin-top: 1.5rem; margin-bottom: 0.75rem; }
.summary-text {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1rem;
  color: var(--text-secondary);
  margin-bottom: 1rem;
}
.health-score {
  text-align: center;
  margin: 1.5rem 0;
}
.health-score .score {
  font-size: 3.5rem;
  font-weight: 800;
  line-height: 1;
}
.health-score .score-label {
  font-size: 0.85rem;
  color: var(--text-muted);
  margin-top: 0.25rem;
}
.severity-bars { margin: 1.5rem 0; }
.bar-row { display: flex; align-items: center; margin-bottom: 0.5rem; }
.bar-label { width: 80px; font-size: 0.8rem; font-weight: 600; }
.bar-track { flex: 1; height: 8px; background: var(--bg-tertiary); border-radius: 4px; overflow: hidden; margin: 0 0.75rem; }
.bar-fill { height: 100%; border-radius: 4px; transition: width 0.3s; }
.bar-count { width: 36px; text-align: right; font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); }
.finding-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1rem 1.25rem;
  margin-bottom: 0.75rem;
}
.finding-header { display: flex; align-items: center; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.5rem; }
.finding-title { font-weight: 600; color: #fff; }
.sev-pill {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 0.7rem;
  font-weight: 700;
  color: #fff;
  text-transform: uppercase;
}
.cwe-badge, .owasp-badge {
  display: inline-block;
  background: rgba(100, 108, 255, 0.15);
  color: var(--accent);
  padding: 1px 8px;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 600;
}
.finding-location {
  font-size: 0.8rem;
  color: var(--text-muted);
  margin-bottom: 0.5rem;
  font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
}
.finding-desc { color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 0.75rem; }
pre.code-block {
  background: #111;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.75rem 1rem;
  overflow-x: auto;
  font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: 0.8rem;
  line-height: 1.5;
  color: #c9d1d9;
  margin-bottom: 0.75rem;
}
.fix-section {
  background: rgba(46, 213, 115, 0.08);
  border: 1px solid rgba(46, 213, 115, 0.25);
  border-radius: 6px;
  padding: 0.75rem 1rem;
  margin-top: 0.5rem;
}
.fix-section .fix-label { font-size: 0.75rem; font-weight: 700; color: ${SEVERITY_COLORS.low}; text-transform: uppercase; margin-bottom: 0.35rem; }
.fix-section pre {
  background: rgba(0,0,0,0.3);
  border-radius: 4px;
  padding: 0.5rem 0.75rem;
  font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: 0.8rem;
  color: #c9d1d9;
  overflow-x: auto;
  margin-top: 0.35rem;
}
.llm-section {
  background: rgba(100, 108, 255, 0.08);
  border: 1px solid rgba(100, 108, 255, 0.25);
  border-radius: 6px;
  padding: 0.75rem 1rem;
  margin-top: 0.5rem;
}
.llm-section .llm-label { font-size: 0.75rem; font-weight: 700; color: var(--accent); text-transform: uppercase; margin-bottom: 0.25rem; }
.llm-section p { font-size: 0.85rem; color: var(--text-secondary); }
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
  margin-top: 0.5rem;
}
th, td { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border); }
th { color: var(--text-muted); font-weight: 600; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; }
td { color: var(--text-secondary); }
footer {
  margin-top: 3rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 0.8rem;
  text-align: center;
}
@media print {
  body { background: #fff; color: #222; padding: 1cm; }
  .container { max-width: 100%; }
  header h1, h2, h3, .finding-title, .meta-card .value { color: #111; }
  .meta-card, .finding-card, .summary-text, .fix-section, .llm-section { border-color: #ccc; background: #f9f9f9; }
  pre.code-block { background: #f5f5f5; color: #333; border-color: #ccc; }
  .bar-track { background: #e0e0e0; }
  .sev-pill { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  .severity-group { page-break-inside: avoid; }
  footer { color: #999; border-color: #ccc; }
}
</style>
</head>
<body>
<div class="container">

<header>
  <h1>Security Scan Report</h1>
  <div class="subtitle">${this.esc(projectName)} — ${this.esc(scanDate)}</div>
</header>

<div class="meta-grid">
  <div class="meta-card"><div class="label">Project</div><div class="value">${this.esc(projectName)}</div></div>
  <div class="meta-card"><div class="label">Profile</div><div class="value">${this.esc(scan.profile)}</div></div>
  <div class="meta-card"><div class="label">Duration</div><div class="value">${this.esc(duration)}</div></div>
  <div class="meta-card"><div class="label">Files Scanned</div><div class="value">${metrics.filesScanned}</div></div>
  <div class="meta-card"><div class="label">Total Findings</div><div class="value">${metrics.totalFindings}</div></div>
  <div class="meta-card"><div class="label">Status</div><div class="value">${this.capFirst(scan.status)}</div></div>
</div>

<h2>Executive Summary</h2>
<div class="health-score">
  <div class="score" style="color:${scoreColor}">${healthScore}</div>
  <div class="score-label">Health Score</div>
</div>
${summaryText}
<div class="severity-bars">
${severityBarsHtml}
</div>

<h2>Findings</h2>
${findings.length ? findingsSectionsHtml : '<p style="color:var(--text-muted)">No findings detected.</p>'}

${depTableHtml}

<footer>
  Generated by LocalMind Security &middot; ${this.esc(new Date().toISOString())}
</footer>

</div>
</body>
</html>`;
  }

  private htmlFindingCard(f: Finding, options: ReportOptions): string {
    const badges: string[] = [];
    if (f.cweId) badges.push(`<span class="cwe-badge">${this.esc(f.cweId)}</span>`);
    if (f.owaspCategory) badges.push(`<span class="owasp-badge">${this.esc(f.owaspCategory)}</span>`);

    const locationParts: string[] = [this.esc(f.filePath)];
    if (f.lineStart != null) locationParts.push(`L${f.lineStart}${f.lineEnd && f.lineEnd !== f.lineStart ? '–' + f.lineEnd : ''}`);

    const codeHtml = f.codeSnippet
      ? `<pre class="code-block">${this.esc(f.codeSnippet)}</pre>`
      : '';

    let fixHtml = '';
    if (options.includeFixSuggestions && f.fixAvailable) {
      const fixCodeBlock = f.fixCode
        ? `<pre>${this.esc(f.fixCode)}</pre>`
        : '';
      fixHtml = `<div class="fix-section">
        <div class="fix-label">Suggested Fix</div>
        ${f.fixExplanation ? `<p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:0.35rem">${this.esc(f.fixExplanation)}</p>` : ''}
        ${fixCodeBlock}
      </div>`;
    }

    let llmHtml = '';
    if (options.includeLlmExplanations && f.llmValidated && f.llmExplanation) {
      llmHtml = `<div class="llm-section">
        <div class="llm-label">AI Analysis${f.llmVerdict ? ` — ${this.capFirst(f.llmVerdict)}` : ''}</div>
        <p>${this.esc(f.llmExplanation)}</p>
      </div>`;
    }

    return `<div class="finding-card">
      <div class="finding-header">
        <span class="sev-pill" style="background:${SEVERITY_COLORS[f.severity]}">${this.capFirst(f.severity)}</span>
        <span class="finding-title">${this.esc(f.title)}</span>
        ${badges.join(' ')}
      </div>
      <div class="finding-location">${locationParts.join(':')}</div>
      <div class="finding-desc">${this.esc(f.description)}</div>
      ${codeHtml}
      ${fixHtml}
      ${llmHtml}
    </div>`;
  }

  // ── PDF ───────────────────────────────────────────────────────────────

  private async generatePdf(html: string, outputPath: string): Promise<Buffer> {
    const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
    try {
      await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      const pdf = await win.webContents.printToPDF({
        pageSize: 'A4',
        printBackground: true,
        margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
      });
      return Buffer.from(pdf);
    } finally {
      win.destroy();
    }
  }

  // ── SARIF ─────────────────────────────────────────────────────────────

  private generateSarif(data: ReportData, options: ReportOptions): string {
    const { scan, findings } = data;
    const ruleMap = new Map<string, { rule: SarifRule; index: number }>();
    const rules: SarifRule[] = [];

    for (const f of findings) {
      if (!ruleMap.has(f.ruleId)) {
        const tags: string[] = [];
        if (f.cweId) tags.push(f.cweId);
        if (f.owaspCategory) tags.push(f.owaspCategory);

        const rule: SarifRule = {
          id: f.ruleId,
          name: f.type,
          shortDescription: { text: f.title },
          fullDescription: { text: f.description },
          help: {
            text: options.includeFixSuggestions && f.fixExplanation
              ? f.fixExplanation
              : f.description,
            markdown: options.includeFixSuggestions && f.fixExplanation
              ? `**Fix:** ${f.fixExplanation}`
              : f.description,
          },
          properties: tags.length ? { tags } : undefined,
        };
        ruleMap.set(f.ruleId, { rule, index: rules.length });
        rules.push(rule);
      }
    }

    const results = findings.map(f => {
      const entry = ruleMap.get(f.ruleId)!;
      const result: Record<string, unknown> = {
        ruleId: f.ruleId,
        ruleIndex: entry.index,
        level: SARIF_LEVEL[f.severity],
        message: { text: f.description },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: this.toFileUri(f.filePath) },
              region: {
                startLine: f.lineStart ?? 1,
                startColumn: f.columnStart ?? 1,
                ...(f.lineEnd != null ? { endLine: f.lineEnd } : {}),
              },
            },
          },
        ],
      };
      if (f.codeSnippet) {
        (result.locations as any)[0].physicalLocation.region.snippet = { text: f.codeSnippet };
      }
      return result;
    });

    const sarif = {
      $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
      version: '2.1.0' as const,
      runs: [
        {
          tool: {
            driver: {
              name: 'LocalMind Security',
              version: '1.0.0',
              informationUri: 'https://localmind.ai',
              rules: rules.map(r => {
                const out: Record<string, unknown> = {
                  id: r.id,
                  name: r.name,
                  shortDescription: r.shortDescription,
                  fullDescription: r.fullDescription,
                  help: r.help,
                };
                if (r.properties) out.properties = r.properties;
                return out;
              }),
            },
          },
          results,
          invocations: [
            {
              executionSuccessful: scan.status === 'complete',
              startTimeUtc: new Date(scan.startedAt).toISOString(),
              ...(scan.completedAt ? { endTimeUtc: new Date(scan.completedAt).toISOString() } : {}),
            },
          ],
        },
      ],
    };

    return JSON.stringify(sarif, null, 2);
  }

  // ── JSON ──────────────────────────────────────────────────────────────

  private generateJson(data: ReportData): string {
    const output = {
      scan: data.scan,
      findings: data.findings,
      dependencyFindings: data.dependencyFindings,
      metrics: data.metrics,
      trend: data.trend,
      executiveSummary: data.executiveSummary ?? null,
      generatedAt: new Date().toISOString(),
    };
    return JSON.stringify(output, null, 2);
  }

  // ── Markdown ──────────────────────────────────────────────────────────

  private generateMarkdown(data: ReportData, options: ReportOptions): string {
    const { scan, findings, dependencyFindings, metrics } = data;
    const projectName = scan.projectName || path.basename(scan.projectRoot);
    const duration = this.fmtDuration(metrics.scanDuration);
    const lines: string[] = [];

    lines.push(`# Security Scan Report`);
    lines.push('');
    lines.push(`| Field | Value |`);
    lines.push(`|-------|-------|`);
    lines.push(`| Project | ${projectName} |`);
    lines.push(`| Profile | ${scan.profile} |`);
    lines.push(`| Date | ${this.fmtDate(scan.startedAt)} |`);
    lines.push(`| Duration | ${duration} |`);
    lines.push(`| Files Scanned | ${metrics.filesScanned} |`);
    lines.push(`| Health Score | ${metrics.healthScore} |`);
    lines.push(`| Status | ${this.capFirst(scan.status)} |`);
    lines.push('');

    lines.push(`## Executive Summary`);
    lines.push('');
    if (data.executiveSummary) {
      lines.push(data.executiveSummary);
      lines.push('');
    }
    lines.push(`| Severity | Count |`);
    lines.push(`|----------|-------|`);
    lines.push(`| Critical | ${metrics.criticalCount} |`);
    lines.push(`| High | ${metrics.highCount} |`);
    lines.push(`| Medium | ${metrics.mediumCount} |`);
    lines.push(`| Low | ${metrics.lowCount} |`);
    lines.push(`| Info | ${metrics.infoCount} |`);
    lines.push(`| **Total** | **${metrics.totalFindings}** |`);
    lines.push('');

    const mdSeverities: FindingSeverity[] = options.severityFilter?.length
      ? options.severityFilter
      : ['critical', 'high'];
    const filtered = findings.filter(f => mdSeverities.includes(f.severity));
    const grouped = this.groupBySeverity(filtered);
    const MAX_PER_GROUP = 25;

    lines.push(`## Findings`);
    lines.push('');

    for (const sev of SEVERITY_ORDER) {
      const group = grouped[sev];
      if (!group?.length) continue;

      const shown = group.slice(0, MAX_PER_GROUP);
      lines.push(`### ${this.capFirst(sev)} (${group.length})`);
      lines.push('');

      for (const f of shown) {
        const loc = f.lineStart != null ? `:${f.lineStart}` : '';
        lines.push(`#### ${f.title}`);
        lines.push('');
        lines.push(`- **File:** \`${f.filePath}${loc}\``);
        if (f.cweId) lines.push(`- **CWE:** ${f.cweId}`);
        if (f.owaspCategory) lines.push(`- **OWASP:** ${f.owaspCategory}`);
        lines.push(`- **Confidence:** ${f.confidence}`);
        lines.push('');
        lines.push(f.description);
        lines.push('');
        if (f.codeSnippet) {
          lines.push('```');
          lines.push(f.codeSnippet);
          lines.push('```');
          lines.push('');
        }
        if (options.includeFixSuggestions && f.fixAvailable && f.fixExplanation) {
          lines.push(`> **Fix:** ${f.fixExplanation}`);
          if (f.fixCode) {
            lines.push('');
            lines.push('```');
            lines.push(f.fixCode);
            lines.push('```');
          }
          lines.push('');
        }
      }

      if (group.length > MAX_PER_GROUP) {
        lines.push(`*...and ${group.length - MAX_PER_GROUP} more ${sev} findings omitted for brevity.*`);
        lines.push('');
      }
    }

    if (dependencyFindings.length) {
      lines.push(`## Dependency Vulnerabilities`);
      lines.push('');
      lines.push(`| Package | Current | Fixed | Severity | CVE |`);
      lines.push(`|---------|---------|-------|----------|-----|`);
      for (const d of dependencyFindings) {
        lines.push(`| ${d.packageName} | ${d.currentVersion || '—'} | ${d.fixedVersion || '—'} | ${this.capFirst(d.severity)} | ${d.cveId || '—'} |`);
      }
      lines.push('');
    }

    lines.push(`---`);
    lines.push(`*Generated by LocalMind Security — ${new Date().toISOString()}*`);

    return lines.join('\n');
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  private computeMetrics(scan: ScanRecord, findings: Finding[]): ScanMetrics {
    const counts: Record<FindingSeverity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const f of findings) counts[f.severity]++;

    return {
      id: `metrics-${scan.id}`,
      scanId: scan.id,
      projectRoot: scan.projectRoot,
      healthScore: scan.healthScore ?? 0,
      criticalCount: counts.critical,
      highCount: counts.high,
      mediumCount: counts.medium,
      lowCount: counts.low,
      infoCount: counts.info,
      totalFindings: findings.length,
      filesScanned: scan.filesScanned,
      scanDuration: scan.completedAt ? scan.completedAt - scan.startedAt : 0,
      llmTokensUsed: 0,
      timestamp: scan.completedAt || scan.startedAt,
    };
  }

  private groupBySeverity(findings: Finding[]): Partial<Record<FindingSeverity, Finding[]>> {
    const groups: Partial<Record<FindingSeverity, Finding[]>> = {};
    for (const f of findings) {
      (groups[f.severity] ??= []).push(f);
    }
    return groups;
  }

  private ensureDir(filePath: string): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  private esc(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private toFileUri(filePath: string): string {
    const normalized = filePath.replace(/\\/g, '/');
    if (normalized.startsWith('/')) return `file://${normalized}`;
    return `file:///${normalized}`;
  }

  private fmtDate(ts: number): string {
    return new Date(ts).toISOString().replace('T', ' ').split('.')[0] + ' UTC';
  }

  private fmtDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    return `${m}m ${s % 60}s`;
  }

  private capFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  private scoreColor(score: number): string {
    if (score >= 80) return SEVERITY_COLORS.low;
    if (score >= 60) return SEVERITY_COLORS.medium;
    if (score >= 40) return SEVERITY_COLORS.high;
    return SEVERITY_COLORS.critical;
  }
}

interface SarifRule {
  id: string;
  name: string;
  shortDescription: { text: string };
  fullDescription: { text: string };
  help: { text: string; markdown: string };
  properties?: { tags: string[] };
}

let instance: ReportGenerator | null = null;

export function getReportGenerator(): ReportGenerator {
  if (!instance) instance = new ReportGenerator();
  return instance;
}
