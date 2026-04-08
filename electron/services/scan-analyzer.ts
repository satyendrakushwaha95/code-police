import { Finding, LlmReviewResult } from './scan-types';
import { getSharedOllama } from './shared-ollama';
import { getModelRouter } from './model-router';
import { OllamaChatMessage } from './embeddings';
import { getUsageTracker } from './usage-tracker';
import * as fs from 'fs';
import * as path from 'path';

const MAX_FINDINGS_PER_BATCH = 8;
const MAX_CODE_CONTEXT_CHARS = 6000;

export class ScanAnalyzer {

  async reviewFindings(
    findings: Finding[],
    projectRoot: string,
    onProgress?: (reviewed: number, total: number) => void,
  ): Promise<Map<string, LlmReviewResult>> {
    const results = new Map<string, LlmReviewResult>();

    const reviewable = findings.filter(f =>
      f.severity === 'critical' || f.severity === 'high' || f.severity === 'medium'
    );

    if (reviewable.length === 0) return results;

    const clusters = this.clusterFindings(reviewable);
    let reviewed = 0;

    for (const cluster of clusters) {
      try {
        const batchResults = await this.reviewCluster(cluster, projectRoot);
        for (const result of batchResults) {
          results.set(result.findingId, result);
        }
      } catch (err) {
        console.warn('[ScanAnalyzer] Cluster review failed:', err);
      }

      reviewed += cluster.length;
      onProgress?.(reviewed, reviewable.length);
    }

    return results;
  }

  async generateScanSummary(
    findings: Finding[],
    projectName: string,
    filesScanned: number,
    healthScore: number,
  ): Promise<string> {
    const critical = findings.filter(f => f.severity === 'critical').length;
    const high = findings.filter(f => f.severity === 'high').length;
    const medium = findings.filter(f => f.severity === 'medium').length;
    const low = findings.filter(f => f.severity === 'low').length;

    const topFindings = findings
      .filter(f => f.severity === 'critical' || f.severity === 'high')
      .slice(0, 5)
      .map(f => `- [${f.severity.toUpperCase()}] ${f.title} in ${f.filePath}:${f.lineStart || '?'}`)
      .join('\n');

    const typeGroups = new Map<string, number>();
    for (const f of findings) {
      typeGroups.set(f.type, (typeGroups.get(f.type) || 0) + 1);
    }
    const topTypes = Array.from(typeGroups.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([type, count]) => `${type} (${count})`)
      .join(', ');

    const prompt = `You are a security engineer writing a brief executive summary of a scan report.

Project: ${projectName}
Files scanned: ${filesScanned}
Health score: ${healthScore}/100
Findings: ${critical} critical, ${high} high, ${medium} medium, ${low} low

Most common issue types: ${topTypes}

Top findings:
${topFindings || 'No critical or high findings.'}

Write a concise 3-4 sentence executive summary. Focus on the most important risks and recommended actions. Do not use markdown formatting.`;

    try {
      const router = getModelRouter();
      const decision = await router.resolve('review');
      const ollama = getSharedOllama();
      const messages: OllamaChatMessage[] = [
        { role: 'system', content: 'You are a concise security report writer.' },
        { role: 'user', content: prompt },
      ];

      let output = '';
      for await (const chunk of ollama.chat(decision.resolvedModel, messages)) {
        if (chunk.message?.content) output += chunk.message.content;
      }

      this.recordUsage('scan-summary', decision.resolvedModel);
      return output.trim();
    } catch {
      return `Scan of ${projectName} found ${findings.length} issues (${critical} critical, ${high} high). Health score: ${healthScore}/100.`;
    }
  }

  private clusterFindings(findings: Finding[]): Finding[][] {
    const byFile = new Map<string, Finding[]>();
    for (const f of findings) {
      const group = byFile.get(f.filePath) || [];
      group.push(f);
      byFile.set(f.filePath, group);
    }

    const clusters: Finding[][] = [];
    for (const fileFindings of byFile.values()) {
      for (let i = 0; i < fileFindings.length; i += MAX_FINDINGS_PER_BATCH) {
        clusters.push(fileFindings.slice(i, i + MAX_FINDINGS_PER_BATCH));
      }
    }

    return clusters;
  }

  private async reviewCluster(
    cluster: Finding[],
    projectRoot: string,
  ): Promise<LlmReviewResult[]> {
    const fileContents = new Map<string, string>();
    for (const f of cluster) {
      if (!fileContents.has(f.filePath)) {
        try {
          const absPath = path.join(projectRoot, f.filePath);
          const content = fs.readFileSync(absPath, 'utf-8');
          fileContents.set(f.filePath, content.slice(0, MAX_CODE_CONTEXT_CHARS));
        } catch {
          fileContents.set(f.filePath, f.codeSnippet || '(file not readable)');
        }
      }
    }

    const findingsText = cluster.map((f, i) => {
      const fileContent = fileContents.get(f.filePath) || '';
      const contextLines = this.extractContext(fileContent, f.lineStart || 1, 10);
      return `### Finding ${i + 1} (id: ${f.id})
Rule: ${f.ruleId}
Severity: ${f.severity}
Type: ${f.title}
File: ${f.filePath}:${f.lineStart || '?'}
CWE: ${f.cweId || 'N/A'}

Matched code:
\`\`\`
${f.codeSnippet || f.description}
\`\`\`

Surrounding context:
\`\`\`
${contextLines}
\`\`\``;
    }).join('\n\n');

    const prompt = `You are a senior security engineer reviewing potential vulnerabilities found by static analysis.

For each finding below, analyze the code and its surrounding context. Determine if the finding is:
- CONFIRMED: A real vulnerability that should be reported
- FALSE_POSITIVE: Not actually exploitable due to context (sanitization, framework protection, etc.)
- NEEDS_REVIEW: Uncertain, requires human review

For confirmed findings, explain the attack vector in 2-3 sentences.

## Findings to Review

${findingsText}

Respond ONLY as a JSON array (no other text):
[{
  "finding_id": "...",
  "verdict": "confirmed" | "false_positive" | "needs_review",
  "confidence": 0.0 to 1.0,
  "explanation": "...",
  "attack_vector": "..." 
}]`;

    try {
      const router = getModelRouter();
      const decision = await router.resolve('review');
      const ollama = getSharedOllama();
      const messages: OllamaChatMessage[] = [
        { role: 'system', content: 'You are a security auditor. Always respond with valid JSON only.' },
        { role: 'user', content: prompt },
      ];

      let rawOutput = '';
      for await (const chunk of ollama.chat(decision.resolvedModel, messages)) {
        if (chunk.message?.content) rawOutput += chunk.message.content;
      }

      this.recordUsage('scan-review', decision.resolvedModel);

      const jsonMatch = rawOutput.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as LlmReviewResult[];
        return parsed.filter(r => r.findingId || r.finding_id).map(r => ({
          findingId: (r as any).finding_id || r.findingId,
          verdict: r.verdict,
          confidence: r.confidence,
          explanation: r.explanation,
          attackVector: (r as any).attack_vector || r.attackVector,
        }));
      }
    } catch (err) {
      console.warn('[ScanAnalyzer] LLM review failed:', err);
    }

    return [];
  }

  private extractContext(content: string, line: number, radius: number): string {
    const lines = content.split('\n');
    const start = Math.max(0, line - 1 - radius);
    const end = Math.min(lines.length, line + radius);
    return lines.slice(start, end).map((l, i) => `${start + i + 1} | ${l}`).join('\n');
  }

  private recordUsage(stage: string, model: string): void {
    try {
      const shared = getSharedOllama();
      const usage = shared.lastUsage;
      if (!usage) return;
      getUsageTracker().record({
        messageId: `scan:${stage}:${Date.now()}`,
        conversationId: `scan:${stage}`,
        providerId: 'ollama-default',
        model,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        durationMs: 0,
        timestamp: Date.now(),
      });
    } catch { /* non-fatal */ }
  }
}

let instance: ScanAnalyzer | null = null;
export function getScanAnalyzer(): ScanAnalyzer {
  if (!instance) instance = new ScanAnalyzer();
  return instance;
}
