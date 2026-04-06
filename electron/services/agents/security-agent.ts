import { OllamaChatMessage } from '../embeddings';
import { getSharedOllama } from '../shared-ollama';
import { RoutingDecision } from '../model-router';
import { CodeOutput, TaskPlan, SecurityResult } from '../pipeline-types';
import * as fs from 'fs';
import * as path from 'path';

const SECRET_PATTERNS = [
  { regex: /(?:api[_-]?key|apikey)\s*[:=]\s*['"]([a-zA-Z0-9]{20,})['"]/i, type: 'hardcoded_api_key' },
  { regex: /(?:password|passwd|pwd)\s*[:=]\s*['"]([^'"]{4,})['"]/i, type: 'hardcoded_password' },
  { regex: /(?:secret|secret_key)\s*[:=]\s*['"]([a-zA-Z0-9]{16,})['"]/i, type: 'hardcoded_secret' },
  { regex: /(?:token|access_token)\s*[:=]\s*['"]([a-zA-Z0-9]{20,})['"]/i, type: 'hardcoded_token' },
  { regex: /(?:private[_-]?key)\s*[:=]\s*['"]([^'"]{20,})['"]/i, type: 'hardcoded_private_key' },
];

const INJECTION_PATTERNS = [
  { regex: /exec\s*\(\s*['"`].*\$\{.*\}.*['"`]\s*\)/, type: 'command_injection', severity: 'critical' as const },
  { regex: /eval\s*\(/, type: 'eval_usage', severity: 'high' as const },
  { regex: /new\s+Function\s*\(/, type: 'function_constructor', severity: 'high' as const },
  { regex: /innerHTML\s*=/, type: 'xss_innerhtml', severity: 'medium' as const },
  { regex: /document\.write\s*\(/, type: 'xss_document_write', severity: 'medium' as const },
];

const SQL_INJECTION_PATTERNS = [
  { regex: /(?:query|execute)\s*\(\s*['"`].*\$\{.*\}.*['"`]\s*\)/, type: 'sql_injection', severity: 'critical' as const },
  { regex: /`SELECT\s+.*\$\{.*\}/, type: 'sql_injection_template', severity: 'critical' as const },
];

export class SecurityAgent {
  async execute(
    codeOutput: CodeOutput,
    taskPlan: TaskPlan,
    projectRoot: string,
    modelDecision: RoutingDecision
  ): Promise<SecurityResult> {
    const vulnerabilities: SecurityResult['vulnerabilities'] = [];
    const dependencyIssues: SecurityResult['dependency_issues'] = [];

    for (const change of codeOutput.file_changes) {
      if (!change.content) continue;

      for (const pattern of SECRET_PATTERNS) {
        if (pattern.regex.test(change.content)) {
          vulnerabilities.push({
            severity: 'high',
            type: pattern.type,
            description: `Potential ${pattern.type} found in ${change.file_path}`,
            file: change.file_path,
            recommendation: 'Use environment variables or a secret manager instead of hardcoding sensitive values.',
          });
        }
      }

      for (const pattern of INJECTION_PATTERNS) {
        if (pattern.regex.test(change.content)) {
          vulnerabilities.push({
            severity: pattern.severity,
            type: pattern.type,
            description: `Potential ${pattern.type} in ${change.file_path}`,
            file: change.file_path,
            recommendation: this.getRecommendation(pattern.type),
          });
        }
      }

      for (const pattern of SQL_INJECTION_PATTERNS) {
        if (pattern.regex.test(change.content)) {
          vulnerabilities.push({
            severity: pattern.severity,
            type: pattern.type,
            description: `Potential ${pattern.type} in ${change.file_path}`,
            file: change.file_path,
            recommendation: 'Use parameterized queries or an ORM instead of string interpolation.',
          });
        }
      }
    }

    const npmAuditResult = await this.runNpmAudit(projectRoot);
    dependencyIssues.push(...npmAuditResult);

    const llmVulnerabilities = await this.runLLMSecurityReview(codeOutput, taskPlan, modelDecision);
    vulnerabilities.push(...llmVulnerabilities);

    const criticalCount = vulnerabilities.filter(v => v.severity === 'critical').length;
    const highCount = vulnerabilities.filter(v => v.severity === 'high').length;
    const mediumCount = vulnerabilities.filter(v => v.severity === 'medium').length;
    const lowCount = vulnerabilities.filter(v => v.severity === 'low').length;

    const score = Math.max(0, 100 - (criticalCount * 25) - (highCount * 15) - (mediumCount * 8) - (lowCount * 3));
    const verdict = (criticalCount > 0 || highCount > 2) ? 'FAIL' : 'PASS';

    return {
      verdict,
      vulnerabilities,
      dependency_issues: dependencyIssues,
      summary: this.buildSummary(vulnerabilities, dependencyIssues, score),
      score,
    };
  }

  private async runNpmAudit(projectRoot: string): Promise<SecurityResult['dependency_issues']> {
    const issues: SecurityResult['dependency_issues'] = [];
    const packageJsonPath = path.join(projectRoot, 'package.json');

    if (!fs.existsSync(packageJsonPath)) return issues;

    try {
      const { execSync } = await import('child_process');
      const auditOutput = execSync('npm audit --json', {
        cwd: projectRoot,
        timeout: 30000,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const audit = JSON.parse(auditOutput);

      if (audit.vulnerabilities) {
        for (const [pkg, info] of Object.entries(audit.vulnerabilities) as any[]) {
          issues.push({
            package: pkg,
            issue: `${info.severity} severity: ${info.title || info.via?.[0]?.title || 'known vulnerability'}`,
            severity: info.severity || 'medium',
          });
        }
      }
    } catch {
      // npm audit not available or failed
    }

    return issues.slice(0, 20);
  }

  private async runLLMSecurityReview(
    codeOutput: CodeOutput,
    taskPlan: TaskPlan,
    modelDecision: RoutingDecision
  ): Promise<SecurityResult['vulnerabilities']> {
    const prompt = this.buildSecurityPrompt(codeOutput, taskPlan);

    const messages: OllamaChatMessage[] = [
      { role: 'system', content: 'You are a security auditor. Review the code changes for security vulnerabilities including OWASP Top 10, injection attacks, authentication bypasses, data exposure, and insecure configurations.' },
      { role: 'user', content: prompt },
    ];

    let rawOutput = '';
    try {
      const ollama = getSharedOllama();
      for await (const chunk of ollama.chat(modelDecision.resolvedModel, messages)) {
        if (chunk.message?.content) {
          rawOutput += chunk.message.content;
        }
      }
    } catch {
      return [];
    }

    try {
      const jsonMatch = rawOutput.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch { /* fall through */ }

    return [];
  }

  private buildSecurityPrompt(codeOutput: CodeOutput, taskPlan: TaskPlan): string {
    const code = codeOutput.file_changes.map(c =>
      `## ${c.file_path} (${c.operation})\n\`\`\`\n${c.content}\n\`\`\``
    ).join('\n');

    return `Review these code changes for security vulnerabilities:

Task: ${taskPlan.task_description}

${code}

Return findings as a JSON array:
[
  {
    "severity": "critical|high|medium|low",
    "type": "vulnerability type",
    "description": "description",
    "file": "file_path",
    "line": 10,
    "recommendation": "how to fix"
  }
]

If no vulnerabilities found, return an empty array [].`;
  }

  private getRecommendation(type: string): string {
    const recommendations: Record<string, string> = {
      'command_injection': 'Use child_process.execFile() with an argument array instead of exec() with string interpolation.',
      'eval_usage': 'Avoid eval(). Use JSON.parse() for JSON, or a proper parser for other formats.',
      'function_constructor': 'Avoid Function constructor. Use a safer alternative.',
      'xss_innerhtml': 'Use textContent or a sanitization library like DOMPurify instead of innerHTML.',
      'xss_document_write': 'Avoid document.write(). Use DOM manipulation methods instead.',
    };
    return recommendations[type] || 'Review and fix this security issue.';
  }

  private buildSummary(
    vulnerabilities: SecurityResult['vulnerabilities'],
    dependencyIssues: SecurityResult['dependency_issues'],
    score: number
  ): string {
    const parts: string[] = [];

    if (vulnerabilities.length === 0 && dependencyIssues.length === 0) {
      return `Security audit passed with a score of ${score}/100. No vulnerabilities detected.`;
    }

    if (vulnerabilities.length > 0) {
      const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
      for (const v of vulnerabilities) bySeverity[v.severity]++;
      parts.push(`Found ${vulnerabilities.length} vulnerability(ies): ${bySeverity.critical} critical, ${bySeverity.high} high, ${bySeverity.medium} medium, ${bySeverity.low} low.`);
    }

    if (dependencyIssues.length > 0) {
      parts.push(`${dependencyIssues.length} dependency issue(s) detected.`);
    }

    parts.push(`Security score: ${score}/100.`);
    return parts.join(' ');
  }
}

let instance: SecurityAgent | null = null;
export function getSecurityAgent(): SecurityAgent {
  if (!instance) instance = new SecurityAgent();
  return instance;
}
