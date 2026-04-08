import * as fs from 'fs';
import * as path from 'path';
import { Finding, FixResult, ApplyResult } from './scan-types';
import { getSharedOllama } from './shared-ollama';
import { getModelRouter } from './model-router';
import { OllamaChatMessage } from './embeddings';
import { getUsageTracker } from './usage-tracker';
import { getRuleRegistry } from './rules/rule-registry';

export class FixGenerator {

  async generateFix(finding: Finding, projectRoot: string): Promise<FixResult> {
    const absPath = path.join(projectRoot, finding.filePath);
    let fileContent = '';
    try {
      fileContent = fs.readFileSync(absPath, 'utf-8');
    } catch {
      throw new Error(`Cannot read file: ${finding.filePath}`);
    }

    const registry = getRuleRegistry();
    const rule = registry.getRule(finding.ruleId);
    const fixGuidance = rule?.fixGuidance || 'Fix the identified vulnerability following security best practices.';

    const contextLines = this.extractContext(fileContent, finding.lineStart || 1, 15);

    const prompt = `You are a security engineer fixing a vulnerability.

## Vulnerability
Type: ${finding.title}
Severity: ${finding.severity}
CWE: ${finding.cweId || 'N/A'}
File: ${finding.filePath}
Line: ${finding.lineStart || 'unknown'}

## Vulnerable Code (with surrounding context)
\`\`\`
${contextLines}
\`\`\`

## Fix Guidance
${fixGuidance}

Generate the MINIMUM code change needed to fix this vulnerability.
Keep the same code style and indentation. Do not refactor unrelated code.
Only change what is necessary to remediate the security issue.

Respond ONLY as JSON (no other text):
{
  "fixed_code": "the corrected code block (same range as the vulnerable code shown above)",
  "explanation": "what was changed and why",
  "breaking_changes": false,
  "test_suggestion": "how to verify the fix works"
}`;

    try {
      const router = getModelRouter();
      const decision = await router.resolve('code_generation');
      const ollama = getSharedOllama();
      const messages: OllamaChatMessage[] = [
        { role: 'system', content: 'You are a security engineer. Always respond with valid JSON only.' },
        { role: 'user', content: prompt },
      ];

      let rawOutput = '';
      for await (const chunk of ollama.chat(decision.resolvedModel, messages)) {
        if (chunk.message?.content) rawOutput += chunk.message.content;
      }

      this.recordUsage('fix-gen', decision.resolvedModel);

      const jsonMatch = rawOutput.match(/\{[\s\S]*"fixed_code"[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          findingId: finding.id,
          fixedCode: parsed.fixed_code || parsed.fixedCode || '',
          explanation: parsed.explanation || '',
          breakingChanges: parsed.breaking_changes ?? parsed.breakingChanges ?? false,
          testSuggestion: parsed.test_suggestion || parsed.testSuggestion,
        };
      }

      throw new Error('LLM did not return valid fix JSON');
    } catch (err) {
      throw new Error(`Fix generation failed: ${err}`);
    }
  }

  async applyFix(finding: Finding, fixResult: FixResult, projectRoot: string): Promise<ApplyResult> {
    const absPath = path.join(projectRoot, finding.filePath);

    try {
      const original = fs.readFileSync(absPath, 'utf-8');

      const backupDir = path.join(projectRoot, '.localmind-backups');
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
      const backupName = `${path.basename(finding.filePath)}.${Date.now()}.bak`;
      const backupPath = path.join(backupDir, backupName);
      fs.writeFileSync(backupPath, original, 'utf-8');

      if (!finding.lineStart || !fixResult.fixedCode) {
        return { findingId: finding.id, filePath: finding.filePath, success: false, error: 'No line information or fix code available' };
      }

      const lines = original.split('\n');
      const snippetLines = (finding.codeSnippet || '').split('\n')
        .filter(l => l.match(/^[> ] *\d+ \| /))
        .map(l => l.replace(/^[> ] *\d+ \| /, ''));

      if (snippetLines.length > 0) {
        const startIdx = finding.lineStart - 1;
        const endIdx = Math.min(startIdx + snippetLines.length, lines.length);
        const fixedLines = fixResult.fixedCode.split('\n');

        lines.splice(startIdx, endIdx - startIdx, ...fixedLines);
        fs.writeFileSync(absPath, lines.join('\n'), 'utf-8');

        return {
          findingId: finding.id,
          filePath: finding.filePath,
          success: true,
          backupPath: `.localmind-backups/${backupName}`,
        };
      }

      return { findingId: finding.id, filePath: finding.filePath, success: false, error: 'Could not determine code range to replace' };

    } catch (err) {
      return { findingId: finding.id, filePath: finding.filePath, success: false, error: String(err) };
    }
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

let instance: FixGenerator | null = null;
export function getFixGenerator(): FixGenerator {
  if (!instance) instance = new FixGenerator();
  return instance;
}
