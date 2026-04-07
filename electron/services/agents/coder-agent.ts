import path from 'node:path';
import { OllamaChatMessage } from '../embeddings';
import { getSharedOllama } from '../shared-ollama';
import { RoutingDecision } from '../model-router';
import { TaskPlan, CodeOutput, FileChange, StreamCallback } from '../pipeline-types';

export class SecurityError extends Error {
  constructor(message: string, public filePath?: string) {
    super(message);
    this.name = 'SecurityError';
  }
}

export interface AgentCoderConfig {
  systemPrompt?: string;
  constraints?: {
    allowedFilePatterns?: string[];
    blockedFilePatterns?: string[];
    allowedLanguages?: string[];
  };
  enabledTools?: Array<{ toolId: string; enabled: boolean }>;
}

export class CoderAgent {
  private projectRoot: string = '';

  setProjectRoot(root: string) {
    this.projectRoot = root;
  }

  async execute(
    plan: TaskPlan,
    fileContents: Map<string, string>,
    reviewIssues: Array<{ description: string; file?: string; severity?: string }>,
    modelDecision: RoutingDecision,
    agentConfig?: AgentCoderConfig,
    onChunk?: StreamCallback
  ): Promise<CodeOutput> {
    const fileContentSection = Array.from(fileContents.entries())
      .map(([filePath, content]) => `### ${filePath}\n\`\`\`\n${content}\n\`\`\``)
      .join('\n\n');

    const correctionSection = reviewIssues.length > 0
      ? `\n\n## CRITICAL: Previous Review Failed - You MUST fix these issues:

${reviewIssues.map((issue, i) => `${i + 1}. [${issue.severity?.toUpperCase() || 'ERROR'}] ${issue.description}${issue.file ? ` (File: ${issue.file})` : ''}`).join('\n')}

Your new code MUST address each issue above. Review your changes carefully before outputting.`
      : '';

    const basePrompt = agentConfig?.systemPrompt
      ? `${agentConfig.systemPrompt}\n\nYou are also a code generation expert.`
      : 'You are a code generation expert. Your job is to implement the given task plan.';

    const languageSection = agentConfig?.constraints?.allowedLanguages && agentConfig.constraints.allowedLanguages.length > 0
      ? `\n\nIMPORTANT: Prefer these languages: ${agentConfig.constraints.allowedLanguages.join(', ')}`
      : '';

    const systemPrompt = `${basePrompt}${languageSection}

You must respond with ONLY valid JSON matching this exact schema:
{
  "file_changes": [
    {
      "file_path": "string - relative path from project root",
      "operation": "create|modify|delete",
      "content": "string - full file content (for create/modify)",
      "explanation": "string - brief explanation of what changed"
    }
  ],
  "summary": "string - brief summary of all changes"
}

IMPORTANT: 
- All file_path values must be relative paths from the project root
- For "modify" operations, include the full file content
- Respond with ONLY JSON, no explanations outside the JSON structure`;

    const userPrompt = `## Task Plan

### Description
${plan.task_description}

### Approach
${plan.approach_notes}

### Subtasks
${plan.subtasks.map(st => `- ${st.description}`).join('\n')}

### Acceptance Criteria
${plan.acceptance_criteria.map(c => `- ${c}`).join('\n')}

### Current File Contents
${fileContentSection || '(No existing files - all operations will be create)'}

${correctionSection}

Generate the code changes to complete this task.`;

    const messages: OllamaChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    let rawOutput = '';
    try {
      const ollama = getSharedOllama();
      for await (const chunk of ollama.chat(modelDecision.resolvedModel, messages)) {
        if (chunk.message?.content) {
          rawOutput += chunk.message.content;
          onChunk?.(chunk.message.content, rawOutput);
        }
      }

      const codeOutput = this.parseResponse(rawOutput);
      this.validateSecurity(codeOutput.file_changes, agentConfig);
      return codeOutput;
    } catch (err) {
      if (err instanceof SecurityError) throw err;
      throw new Error(`Coder failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  private parseResponse(rawOutput: string): CodeOutput {
    let parsed: any = null;

    // Strategy 1: markdown code fence
    const codeBlockMatch = rawOutput.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      parsed = this.tryParseJSON(codeBlockMatch[1].trim());
    }

    // Strategy 2: balanced brace extraction
    if (!parsed) {
      parsed = this.extractBalancedJSON(rawOutput);
    }

    // Strategy 3: greedy regex
    if (!parsed) {
      const jsonMatch = rawOutput.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = this.tryParseJSON(jsonMatch[0]);
      }
    }

    // Strategy 4: repair common JSON issues and retry
    if (!parsed) {
      const repaired = this.repairJSON(rawOutput);
      if (repaired) {
        parsed = this.tryParseJSON(repaired);
      }
    }

    // Strategy 5: extract file_changes array directly
    if (!parsed) {
      const arrayMatch = rawOutput.match(/"file_changes"\s*:\s*(\[[\s\S]*\])/);
      if (arrayMatch) {
        const wrapped = `{"file_changes": ${arrayMatch[1]}, "summary": ""}`;
        parsed = this.tryParseJSON(wrapped);
      }
    }

    // Strategy 6: synthesize from raw output (last resort)
    if (!parsed || !Array.isArray(parsed.file_changes)) {
      console.warn('[CoderAgent] All JSON parsing strategies failed, attempting raw extraction');
      const fileChanges = this.extractFileChangesFromText(rawOutput);
      if (fileChanges.length > 0) {
        return { file_changes: fileChanges, summary: 'Extracted from non-JSON response' };
      }
      throw new Error('No valid JSON found in response');
    }

    return {
      file_changes: parsed.file_changes,
      summary: parsed.summary || ''
    };
  }

  private tryParseJSON(text: string): any {
    try { return JSON.parse(text); } catch {}
    const repaired = this.repairJSON(text);
    if (repaired) {
      try { return JSON.parse(repaired); } catch {}
    }
    return null;
  }

  private repairJSON(text: string): string | null {
    try {
      let fixed = text;
      // Remove trailing commas before } or ]
      fixed = fixed.replace(/,\s*([}\]])/g, '$1');
      // Remove control characters inside strings (except \n \t \r)
      fixed = fixed.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
      // Fix single quotes to double quotes (rough)
      if (!fixed.includes('"') && fixed.includes("'")) {
        fixed = fixed.replace(/'/g, '"');
      }
      // Extract just the JSON object if there's text around it
      const jsonStart = fixed.indexOf('{');
      const jsonEnd = fixed.lastIndexOf('}');
      if (jsonStart >= 0 && jsonEnd > jsonStart) {
        fixed = fixed.substring(jsonStart, jsonEnd + 1);
      }
      return fixed;
    } catch {
      return null;
    }
  }

  private extractBalancedJSON(text: string): any {
    const startIndex = text.indexOf('{');
    if (startIndex === -1) return null;

    let braceCount = 0;
    let endIndex = -1;
    let inString = false;
    let escapeNext = false;

    for (let i = startIndex; i < text.length; i++) {
      const char = text[i];
      if (escapeNext) { escapeNext = false; continue; }
      if (char === '\\' && inString) { escapeNext = true; continue; }
      if (char === '"' && !escapeNext) { inString = !inString; continue; }
      if (!inString) {
        if (char === '{') braceCount++;
        if (char === '}') braceCount--;
        if (braceCount === 0) { endIndex = i; break; }
      }
    }

    if (endIndex === -1) return null;
    return this.tryParseJSON(text.substring(startIndex, endIndex + 1));
  }

  private extractFileChangesFromText(text: string): Array<{ file_path: string; operation: 'create' | 'modify' | 'delete'; content: string; explanation: string }> {
    const changes: Array<{ file_path: string; operation: 'create' | 'modify' | 'delete'; content: string; explanation: string }> = [];

    // Look for code blocks with file paths: ```language:filepath or ### filepath
    const blockPattern = /(?:###\s+(.+?)\n|```\w*:(.+?)\n)([\s\S]*?)```/g;
    let match;
    while ((match = blockPattern.exec(text)) !== null) {
      const filePath = (match[1] || match[2] || '').trim();
      const content = (match[3] || '').trim();
      if (filePath && content && filePath.includes('.')) {
        changes.push({ file_path: filePath, operation: 'create', content, explanation: 'Extracted from response' });
      }
    }

    // Also look for standalone code blocks with file references above them
    if (changes.length === 0) {
      const simpleBlockPattern = /(?:`([^`]+\.[a-zA-Z]+)`[:\s]*\n)?```\w*\n([\s\S]*?)```/g;
      while ((match = simpleBlockPattern.exec(text)) !== null) {
        const filePath = (match[1] || '').trim();
        const content = (match[2] || '').trim();
        if (filePath && content) {
          changes.push({ file_path: filePath, operation: 'create', content, explanation: 'Extracted from code block' });
        }
      }
    }

    return changes;
  }

  private validateSecurity(fileChanges: FileChange[], agentConfig?: AgentCoderConfig): void {
    if (!this.projectRoot) {
      console.warn('[CoderAgent] No project root set, skipping security check');
      return;
    }

    const resolvedRoot = path.resolve(this.projectRoot);
    const constraints = agentConfig?.constraints;

    for (const change of fileChanges) {
      const resolvedPath = path.resolve(this.projectRoot, change.file_path);

      if (!resolvedPath.startsWith(resolvedRoot + path.sep) && resolvedPath !== resolvedRoot) {
        throw new SecurityError(
          `File path escapes project root: ${change.file_path}`,
          change.file_path
        );
      }

      if (constraints?.blockedFilePatterns && constraints.blockedFilePatterns.length > 0) {
        for (const pattern of constraints.blockedFilePatterns) {
          if (this.matchPattern(change.file_path, pattern)) {
            throw new SecurityError(
              `File path matches blocked pattern "${pattern}": ${change.file_path}`,
              change.file_path
            );
          }
        }
      }
    }
  }

  private matchPattern(filePath: string, pattern: string): boolean {
    if (pattern === '*' || pattern === '**/*') return true;

    const normalizedPath = filePath.replace(/\\/g, '/');
    const fileName = normalizedPath.split('/').pop() || normalizedPath;

    // Extension-only patterns (*.java, *.ts, *.env) — match filename part
    if (pattern.startsWith('*.') && !pattern.includes('/')) {
      const ext = pattern.slice(1);
      return fileName.endsWith(ext);
    }

    // Exact filename patterns without path (e.g., .env, Dockerfile)
    if (!pattern.includes('/') && !pattern.includes('*')) {
      return fileName === pattern;
    }

    // Dotfile patterns (e.g., .env.*)
    if (pattern.startsWith('.') && pattern.includes('*')) {
      const prefix = pattern.replace(/\*/g, '');
      return fileName.startsWith(prefix);
    }

    // Convert glob to regex for complex patterns
    let regex = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '{{DOUBLE_STAR}}')
      .replace(/\*/g, '{{SINGLE_STAR}}')
      .replace(/\{\{DOUBLE_STAR\}\}/g, '.*')
      .replace(/\{\{SINGLE_STAR\}\}/g, '[^/]*');

    if (new RegExp(`^${regex}$`).test(normalizedPath)) return true;
    if (new RegExp(regex).test(normalizedPath)) return true;
    if (!pattern.includes('/') && new RegExp(`^${regex}$`).test(fileName)) return true;

    return false;
  }
}

let instance: CoderAgent | null = null;

export function getCoderAgent(): CoderAgent {
  if (!instance) {
    instance = new CoderAgent();
  }
  return instance;
}
